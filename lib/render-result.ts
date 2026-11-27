const OUTPUT_LIMIT = 256 * 1024;

export function renderResult(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.length <= OUTPUT_LIMIT) return serialized;
  return JSON.stringify(
    {
      truncated: true,
      originalCharacters: serialized.length,
      preview: serialized.slice(0, OUTPUT_LIMIT),
    },
    null,
    2,
  );
}
