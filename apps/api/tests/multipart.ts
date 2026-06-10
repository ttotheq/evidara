// Hand-built multipart bodies for app.inject(); metadata fields are emitted
// before the file part, matching the order the API requires.
export function buildMultipartPayload(
  fields: Record<string, string>,
  file: { filename: string; contentType: string; content: Buffer },
): { payload: Buffer; contentType: string } {
  const boundary = "----evidara-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      "utf8",
    ),
  );
  chunks.push(file.content);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
