// exceljs cell accessors. Merged cells replicate the master value across the
// whole range, so callers read the merge top-left address directly.

// Unwrap a cell to a primitive, PRESERVING Date objects (needed by normDate).
export function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("formula" in v) return v.result ?? null;
    if ("text" in v) return v.text; // hyperlink display text
    if ("error" in v) return null;
    return null;
  }
  return v;
}

// Trimmed text form. Dates collapse to YYYY-MM-DD (rarely used for text cells).
export function cellText(cell) {
  const v = cellValue(cell);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
