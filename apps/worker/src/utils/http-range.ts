/** `Range: bytes=start-end` を R2 get 用に解釈する。不正なら null（全体を返す） */
export function parseHttpBytesRange(
  header: string | undefined,
  size: number,
): { offset: number; length: number } | null {
  if (!header || size <= 0) return null;
  const spec = header.trim();
  if (!spec.toLowerCase().startsWith('bytes=')) return null;
  const first = spec.slice(6).split(',')[0]?.trim();
  if (!first) return null;
  const dash = first.indexOf('-');
  if (dash < 0) return null;
  const left = first.slice(0, dash);
  const right = first.slice(dash + 1);

  let start: number;
  let end: number;
  if (left === '') {
    const suffix = Number(right);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(left);
    end = right === '' ? size - 1 : Number(right);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end >= size || start > end) return null;
  return { offset: start, length: end - start + 1 };
}
