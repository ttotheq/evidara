import { fileTypeFromBuffer } from "file-type";

// Text formats have no magic bytes. When the sample is valid text we accept
// the declared type only from this list; everything else degrades to
// text/plain so a forged declaration cannot smuggle an unexpected type.
const TEXT_MEDIA_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

export function looksLikeText(sample: Buffer): boolean {
  if (sample.length === 0) return false;
  if (sample.includes(0)) return false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // The sample may end mid-way through a multi-byte sequence; trimming up to
  // three trailing bytes is enough to complete any UTF-8 code point.
  for (let trim = 0; trim <= 3 && trim < sample.length; trim += 1) {
    try {
      decoder.decode(sample.subarray(0, sample.length - trim));
      return true;
    } catch {
      // Try a shorter sample.
    }
  }
  return false;
}

export function normalizeDeclaredType(declared: string | undefined): string | null {
  if (!declared) return null;
  const bare = declared.split(";")[0]?.trim().toLowerCase();
  return bare && bare.length > 0 ? bare : null;
}

// Server-side content detection from the first bytes of the stream. The
// browser-declared type is never trusted for binary formats.
export async function detectMediaType(
  firstBytes: Buffer,
  declaredType: string | undefined,
): Promise<string> {
  const detected = await fileTypeFromBuffer(firstBytes);
  if (detected) return detected.mime;

  if (looksLikeText(firstBytes)) {
    const declared = normalizeDeclaredType(declaredType);
    if (declared && TEXT_MEDIA_TYPES.has(declared)) return declared;
    return "text/plain";
  }

  return "application/octet-stream";
}
