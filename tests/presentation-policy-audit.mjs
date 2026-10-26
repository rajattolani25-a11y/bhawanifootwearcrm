// Isolated PostgreSQL permissions test. Requires Docker; no production connection.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CATALOG_THEMES } from "../src/lib/catalog-themes.ts";
const migration = readFileSync(
  new URL("../drizzle/migrations/0021_catalog_presentation_settings.sql", import.meta.url),
  "utf8",
);
const currentMigration = readFileSync(
  new URL("../drizzle/migrations/0022_catalog_presentation_settings.sql", import.meta.url),
  "utf8",
);
const themeMigration = readFileSync(
  new URL("../drizzle/migrations/0023_catalog_theme.sql", import.meta.url),
  "utf8",
);
const themeIds = CATALOG_THEMES.map((theme) => theme.id);
const themeSql = themeIds.map((id) => "'" + id.replaceAll("'", "''") + "'").join(",");
const name = "solestack-presentation-" + randomUUID().slice(0, 8);
const docker = (args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
try {
  docker([
    "run",
    "--rm",
    "-d",
    "--network",
    "none",
    "--name",
    name,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  ]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      docker(["exec", name, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw Error("Isolated PostgreSQL did not start");
  const before = `CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
 CREATE TYPE public.app_role AS ENUM ('owner','staff');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.has_role(_user uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user='00000000-0000-4000-8000-000000000001'::uuid AND _role='owner' $$;
 CREATE TABLE public.business_fixture(id int PRIMARY KEY, total int); INSERT INTO public.business_fixture VALUES(1,799);
 `;
  const check = `
 DO $$ BEGIN IF NOT (SELECT gallery_enabled AND category_accents AND motion_enabled FROM public.catalog_presentation_settings WHERE id=1) THEN RAISE EXCEPTION 'defaults incorrect'; END IF; END $$;
 SET ROLE anon;
 SELECT * FROM public.catalog_presentation_settings;
 DO $$ BEGIN
   BEGIN UPDATE public.catalog_presentation_settings SET gallery_enabled=false; RAISE EXCEPTION 'anonymous wrote'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN INSERT INTO public.catalog_presentation_settings(id) VALUES(1); RAISE EXCEPTION 'anonymous inserted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN DELETE FROM public.catalog_presentation_settings; RAISE EXCEPTION 'anonymous deleted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
 RESET ROLE; SET ROLE authenticated;
 SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
 DO $$ DECLARE affected int; BEGIN UPDATE public.catalog_presentation_settings SET gallery_enabled=false WHERE id=1; GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>0 THEN RAISE EXCEPTION 'staff wrote'; END IF; END $$;
 SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
 UPDATE public.catalog_presentation_settings SET gallery_enabled=false,category_accents=false,motion_enabled=false WHERE id=1;
 DO $$ BEGIN
   IF (SELECT gallery_enabled OR category_accents OR motion_enabled FROM public.catalog_presentation_settings WHERE id=1) THEN RAISE EXCEPTION 'owner false not saved'; END IF;
   BEGIN UPDATE public.catalog_presentation_settings SET id=2; RAISE EXCEPTION 'owner changed singleton id'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN DELETE FROM public.catalog_presentation_settings; RAISE EXCEPTION 'owner deleted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE public.catalog_presentation_settings SET motion_enabled=NULL; RAISE EXCEPTION 'null accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
 END $$;
 RESET ROLE; SET ROLE anon;
 DO $$ BEGIN IF (SELECT gallery_enabled OR category_accents OR motion_enabled FROM public.catalog_presentation_settings WHERE id=1) THEN RAISE EXCEPTION 'public false not readable'; END IF; END $$;
 RESET ROLE;
 `;
  const after = `DO $$ BEGIN
 IF (SELECT gallery_enabled OR category_accents OR motion_enabled FROM public.catalog_presentation_settings WHERE id=1) THEN RAISE EXCEPTION 'migration rerun reset preferences'; END IF;
 IF (SELECT count(*) FROM public.catalog_presentation_settings)<>1 THEN RAISE EXCEPTION 'not singleton'; END IF;
 IF (SELECT total FROM public.business_fixture WHERE id=1)<>799 THEN RAISE EXCEPTION 'business record changed'; END IF;
 END $$;`;
  const themeBefore = `
 CREATE TEMP TABLE flags_before_theme AS SELECT id,gallery_enabled,category_accents,motion_enabled FROM public.catalog_presentation_settings;
 CREATE TEMP TABLE policies_before_theme AS SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) AS signature FROM pg_policies p WHERE schemaname='public' AND tablename='catalog_presentation_settings';
 `;
  const themeCheck = `
 DO $$ BEGIN IF (SELECT theme FROM public.catalog_presentation_settings WHERE id=1)<>'studio' THEN RAISE EXCEPTION 'theme default incorrect'; END IF; END $$;
 SET ROLE anon;
 SELECT * FROM public.catalog_presentation_settings;
 DO $$ BEGIN
   BEGIN UPDATE public.catalog_presentation_settings SET theme='midnight' WHERE id=1; RAISE EXCEPTION 'anonymous theme write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
 RESET ROLE; SET ROLE authenticated;
 SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
 DO $$ DECLARE affected int; BEGIN
   UPDATE public.catalog_presentation_settings SET theme='midnight' WHERE id=1;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>0 THEN RAISE EXCEPTION 'staff theme write'; END IF;
 END $$;
 SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
 DO $$ DECLARE candidate text; BEGIN
   FOREACH candidate IN ARRAY ARRAY[${themeSql}] LOOP
     UPDATE public.catalog_presentation_settings SET theme=candidate WHERE id=1;
     IF (SELECT theme FROM public.catalog_presentation_settings WHERE id=1)<>candidate THEN RAISE EXCEPTION 'palette not retained: %',candidate; END IF;
   END LOOP;
   BEGIN UPDATE public.catalog_presentation_settings SET theme='unknown-palette' WHERE id=1; RAISE EXCEPTION 'invalid theme accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
   BEGIN UPDATE public.catalog_presentation_settings SET theme=NULL WHERE id=1; RAISE EXCEPTION 'null theme accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
   BEGIN UPDATE public.catalog_presentation_settings SET id=2 WHERE id=1; RAISE EXCEPTION 'id changed with theme permissions'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN DELETE FROM public.catalog_presentation_settings WHERE id=1; RAISE EXCEPTION 'deleted with theme permissions'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END $$;
 UPDATE public.catalog_presentation_settings SET theme='midnight' WHERE id=1;
 RESET ROLE; SET ROLE anon;
 DO $$ BEGIN IF (SELECT theme FROM public.catalog_presentation_settings WHERE id=1)<>'midnight' THEN RAISE EXCEPTION 'public cannot read saved theme'; END IF; END $$;
 RESET ROLE;
 `;
  const themeAfter = `
 DO $$ BEGIN
   IF (SELECT theme FROM public.catalog_presentation_settings WHERE id=1)<>'midnight' THEN RAISE EXCEPTION 'migration reset saved theme'; END IF;
   IF EXISTS (SELECT id,gallery_enabled,category_accents,motion_enabled FROM public.catalog_presentation_settings EXCEPT SELECT * FROM flags_before_theme) THEN RAISE EXCEPTION 'existing switches changed'; END IF;
   IF (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='catalog_presentation_settings') IS DISTINCT FROM (SELECT signature FROM policies_before_theme) THEN RAISE EXCEPTION 'existing RLS changed'; END IF;
   IF (SELECT total FROM public.business_fixture WHERE id=1)<>799 THEN RAISE EXCEPTION 'business row changed by theme migration'; END IF;
 END $$;
 `;
  const run = spawnSync(
    "docker",
    ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input: [
        before,
        migration,
        check,
        migration,
        after,
        currentMigration,
        themeBefore,
        themeMigration,
        themeCheck,
        themeMigration,
        themeAfter,
      ].join("\n"),
      encoding: "utf8",
    },
  );
  if (run.status !== 0) throw Error(run.stderr + "\n" + run.stdout);
  console.log(
    JSON.stringify({
      engine: "PostgreSQL17, isolated container, no network",
      anonymousRead: true,
      anonymousWriteDenied: true,
      staffWriteDenied: true,
      ownerUpdate: true,
      explicitFalseRetained: true,
      nullDenied: true,
      idUpdateDenied: true,
      deleteDenied: true,
      idempotentMigration: true,
      businessFixtureUnchanged: true,
      allSevenThemesSaved: themeIds,
      publicSavedThemeRead: true,
      anonymousThemeWriteDenied: true,
      staffThemeWriteDenied: true,
      invalidThemeDenied: true,
      nullThemeDenied: true,
      existingSwitchesPreserved: true,
      existingRlsPoliciesUnchanged: true,
      savedThemePreservedOnReapply: true,
    }),
  );
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {}
}
