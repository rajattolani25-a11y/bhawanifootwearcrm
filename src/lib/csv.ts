/** RFC 4180 records: escaped quotes, embedded newlines, CRLF and UTF-8 BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const field = () => {
    row.push(value);
    value = "";
    closed = false;
  };
  const record = () => {
    field();
    if (row.some((v) => v.trim())) records.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else value += ch;
    } else if (ch === ",") field();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      record();
    } else if (ch === '"' && !value && !closed) quoted = true;
    else if (closed && /\s/.test(ch)) continue;
    else if (closed || ch === '"') throw new Error(`Invalid CSV quoting near character ${i + 1}.`);
    else value += ch;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (row.length || value || closed) record();
  if (!records.length) return [];
  const headers = records.shift()!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("CSV needs unique, non-empty column headings.");
  return records.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`CSV row ${i + 2}: expected ${headers.length} columns, found ${r.length}.`);
    return Object.fromEntries(headers.map((h, col) => [h, r[col]!]));
  });
}
