import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";

export async function signedProductImage(path?: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function addSignedImages<T extends { image_url?: string | null }>(rows: T[]) {
  return Promise.all(rows.map(async (row) => ({ ...row, image_src: await signedProductImage(row.image_url) })));
}

export async function uploadProductImage(productId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { error: updateError } = await supabase.from("products").update({ image_url: path }).eq("id", productId);
  if (updateError) throw updateError;
  return path;
}