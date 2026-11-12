import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicClient } from "./catalog.functions";
import { publicCatalogPhotoCache } from "./public-catalog-photo-cache";
import {
  defaultShowcase,
  SHOWCASE_BUCKET,
  showcaseConfig,
  showcaseItems,
  showcasePaths,
  type ShowcaseConfig,
} from "./catalog-showcase";

const tokenSchema = z.string().min(20).max(8000);
const missing = (code: string) => ["PGRST202", "42883", "42703"].includes(code);
async function ownerClient(token: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw Error("Sign in again to edit Showcase.");
  const role = await sb.rpc("has_role", { _user_id: data.user.id, _role: "owner" });
  if (role.error || role.data !== true) throw Error("Owner access required.");
  return sb;
}
async function imageUrls(sb: Awaited<ReturnType<typeof publicClient>>, config: ShowcaseConfig) {
  const paths = [...new Set(showcasePaths(config))];
  if (!paths.length) return {} as Record<string, string>;
  const scope = `${process.env["SUPABASE_URL"]}:${process.env["SUPABASE_PUBLISHABLE_KEY"]}`;
  // Fresh authorized metadata is read first. Cache signed URLs only, never enabled state.
  const signed = await publicCatalogPhotoCache(scope).getMany(
    SHOWCASE_BUCKET,
    paths,
    async (batch) => {
      const result = await sb.storage.from(SHOWCASE_BUCKET).createSignedUrls(batch, 3600);
      return new Map(
        (result.data ?? []).flatMap((row) =>
          row.path && row.signedUrl ? [[row.path, row.signedUrl]] : [],
        ),
      );
    },
  );
  return Object.fromEntries(signed);
}
export const getCatalogShowcase = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ audience: z.enum(["men", "women"]) }).parse(value))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const result = await sb.rpc("public_catalog_showcase", { _audience: data.audience });
    if (result.error && !missing(result.error.code))
      throw Error("Showcase could not be loaded. Please retry.");
    if (!result.error && result.data === null) return { items: [] };
    const config =
      result.error || result.data.config === null
        ? defaultShowcase()
        : showcaseConfig.parse(result.data.config);
    const selected = {
      ...config,
      items: config.enabled
        ? config.items.filter((item) => item.enabled && item.audience === data.audience)
        : [],
    };
    let images: Record<string, string> = {};
    try {
      images = await imageUrls(sb, selected);
    } catch {
      /* A photo outage cannot erase included artwork or block shopping. */
    }
    return { items: showcaseItems(selected, images) };
  });
export const getOwnerShowcase = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ token: tokenSchema }).parse(value))
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const result = await sb.rpc("owner_catalog_showcase");
    if (result.error) {
      if (missing(result.error.code))
        return {
          ready: false,
          snapshot: null,
          items: showcaseItems(defaultShowcase(), {}),
          storage: null,
        };
      throw Error("Showcase settings could not be loaded. Retry without losing your draft.");
    }
    const snapshot = result.data.config === null ? null : showcaseConfig.parse(result.data.config);
    const config = snapshot ?? defaultShowcase();
    const paths = showcasePaths(config);
    const signed = paths.length
      ? await sb.storage.from(SHOWCASE_BUCKET).createSignedUrls(paths, 3600)
      : null;
    const images = Object.fromEntries(
      (signed?.data ?? []).flatMap((row) =>
        row.path && row.signedUrl ? [[row.path, row.signedUrl]] : [],
      ),
    );
    return {
      ready: true,
      snapshot,
      items: showcaseItems(config, images),
      storage: result.data.storage as { photo_bytes: number; photos: number; pending: string[] },
    };
  });
export const saveOwnerShowcase = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({ token: tokenSchema, expected: showcaseConfig.nullable(), settings: showcaseConfig })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const result = await sb.rpc("save_catalog_showcase", {
      _settings: data.settings,
      _expected: data.expected,
    });
    if (result.error) throw Error(result.error.message);
    return showcaseConfig.parse(result.data);
  });
export const cleanupShowcaseUploads = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        token: tokenSchema,
        paths: z.array(z.string().regex(/^showcase\/[0-9a-f-]{36}(-thumb)?\.webp$/)).max(48),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const sb = await ownerClient(data.token);
    const result = await sb.rpc("unused_catalog_showcase_photos", { _paths: data.paths });
    if (result.error) throw Error("Unused Showcase photo cleanup is unavailable. Retry cleanup.");
    const paths = z
      .array(z.string().regex(/^showcase\/[0-9a-f-]{36}(-thumb)?\.webp$/))
      .max(48)
      .parse(result.data);
    if (paths.length) {
      const removed = await sb.storage.from(SHOWCASE_BUCKET).remove(paths);
      if (removed.error)
        throw Error("Showcase saved; unused photo cleanup is pending. Retry cleanup.");
    }
    return true;
  });
