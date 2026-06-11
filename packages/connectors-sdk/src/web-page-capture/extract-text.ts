// Readable-text extraction from captured HTML without executing any page
// JavaScript: non-content blocks are dropped, tags stripped, entities decoded.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
};

export function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(codePoint)
          ? match
          : String.fromCodePoint(codePoint);
      }
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint)
          ? match
          : String.fromCodePoint(codePoint);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function stripBlocks(html: string): string {
  return html.replaceAll(
    /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    " ",
  );
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!match?.[1]) return null;
  const title = decodeEntities(match[1]).replaceAll(/\s+/g, " ").trim();
  return title.length > 0 ? title : null;
}

export function extractCanonicalUrl(
  html: string,
  baseUrl: string,
): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?canonical["']?/i.test(tag)) continue;
    const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[2] ?? href?.[3] ?? href?.[4];
    if (!value) continue;
    try {
      return new URL(decodeEntities(value), baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

// Plain-text rendering of HTML content. Block-level boundaries become line
// breaks so the result stays readable for review and search.
export function extractReadableText(html: string): string {
  const withoutBlocks = stripBlocks(html)
    .replaceAll(/<!--[\s\S]*?-->/g, " ")
    .replaceAll(
      /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi,
      "\n",
    )
    .replaceAll(/<[^>]+>/g, " ");
  return decodeEntities(withoutBlocks)
    .split("\n")
    .map((line) => line.replaceAll(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
