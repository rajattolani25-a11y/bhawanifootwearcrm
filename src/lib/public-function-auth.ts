/** Missing/unknown metadata fails back to the ordinary auth attachment. */
export function matchesPublicFunction(
  id: string | undefined,
  functions: readonly { url?: string }[],
) {
  return !!id && functions.some((fn) => typeof fn.url === "string" && fn.url.endsWith("/" + id));
}
