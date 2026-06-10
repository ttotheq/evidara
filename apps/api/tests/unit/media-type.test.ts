import { describe, expect, it } from "vitest";
import {
  detectMediaType,
  looksLikeText,
  normalizeDeclaredType,
} from "../../src/modules/evidence/media-type.js";

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);

const PDF_HEADER = Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1");

describe("detectMediaType", () => {
  it("detects binary formats from magic bytes regardless of declaration", async () => {
    await expect(detectMediaType(PNG_HEADER, "text/plain")).resolves.toBe(
      "image/png",
    );
    await expect(
      detectMediaType(PDF_HEADER, "application/octet-stream"),
    ).resolves.toBe("application/pdf");
  });

  it("accepts a declared text type only from the text allowlist", async () => {
    const csv = Buffer.from("name,role\nada,analyst\n", "utf8");
    await expect(detectMediaType(csv, "text/csv")).resolves.toBe("text/csv");
    await expect(
      detectMediaType(Buffer.from("{}", "utf8"), "application/json"),
    ).resolves.toBe("application/json");
  });

  it("degrades forged declarations on text content to text/plain", async () => {
    const text = Buffer.from("just words", "utf8");
    await expect(detectMediaType(text, "application/x-evil")).resolves.toBe(
      "text/plain",
    );
    await expect(detectMediaType(text, undefined)).resolves.toBe("text/plain");
  });

  it("classifies undetectable binary content as octet-stream", async () => {
    const junk = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff, 0x00, 0x10]);
    await expect(detectMediaType(junk, "text/plain")).resolves.toBe(
      "application/octet-stream",
    );
  });
});

describe("looksLikeText", () => {
  it("rejects empty buffers and null bytes", () => {
    expect(looksLikeText(Buffer.alloc(0))).toBe(false);
    expect(looksLikeText(Buffer.from("ab\0cd"))).toBe(false);
  });

  it("accepts UTF-8 even when the sample ends mid-codepoint", () => {
    const emoji = Buffer.from("evidence ✅", "utf8");
    expect(looksLikeText(emoji)).toBe(true);
    // Cut one byte into the multi-byte check mark.
    expect(looksLikeText(emoji.subarray(0, emoji.length - 1))).toBe(true);
  });

  it("rejects invalid UTF-8 sequences", () => {
    expect(looksLikeText(Buffer.from([0xc3, 0x28, 0xa0, 0xa1]))).toBe(false);
  });
});

describe("normalizeDeclaredType", () => {
  it("strips parameters and lowercases", () => {
    expect(normalizeDeclaredType("Text/CSV; charset=utf-8")).toBe("text/csv");
    expect(normalizeDeclaredType(undefined)).toBeNull();
    expect(normalizeDeclaredType("")).toBeNull();
  });
});
