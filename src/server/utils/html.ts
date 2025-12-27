const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function stripHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input;

  // Normalize common line breaks used in chat payloads.
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/p\s*>/gi, "\n");
  s = s.replace(/<\s*p\s*>/gi, "");

  // Remove all remaining tags.
  s = s.replace(/<[^>]*>/g, "");

  // Decode a minimal set of HTML entities.
  for (const [entity, value] of Object.entries(ENTITY_MAP)) {
    s = s.split(entity).join(value);
  }

  // Collapse excessive whitespace while preserving newlines.
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/[\t\f\v]+/g, " ");
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return s.trim();
}
