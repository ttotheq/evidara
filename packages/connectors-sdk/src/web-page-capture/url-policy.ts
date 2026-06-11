// Network target policy for web capture. Classifies URLs and resolved
// addresses so the connector never touches loopback, private, link-local,
// multicast, reserved, or cloud-metadata networks over IPv4 or IPv6.

export type UrlRejectionCode =
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "BLOCKED_TARGET";

export type UrlVerdict =
  | { ok: true; url: URL }
  | { ok: false; errorCode: UrlRejectionCode; reason: string };

// Parses and normalizes a capture target. The WHATWG URL parser canonicalizes
// exotic IPv4 spellings (hex, octal, integer) into dotted-quad form, so the
// address classifier below sees one representation.
export function normalizeTargetUrl(raw: string): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      errorCode: "INVALID_URL",
      reason: "The target is not a valid absolute URL.",
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_SCHEME",
      reason: "Only http and https targets are supported.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      errorCode: "BLOCKED_TARGET",
      reason: "URLs with embedded credentials are not allowed.",
    };
  }
  if (!url.hostname) {
    return {
      ok: false,
      errorCode: "INVALID_URL",
      reason: "The target has no host.",
    };
  }
  url.hash = "";
  return { ok: true, url };
}

export interface AddressVerdict {
  blocked: boolean;
  category: string;
}

function parseIpv4(hostname: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function classifyIpv4(octets: number[]): AddressVerdict {
  const [a = 0, b = 0] = octets;
  if (a === 0) return { blocked: true, category: "this-network" };
  if (a === 10) return { blocked: true, category: "private" };
  if (a === 100 && b >= 64 && b <= 127) {
    return { blocked: true, category: "carrier-grade-nat" };
  }
  if (a === 127) return { blocked: true, category: "loopback" };
  if (a === 169 && b === 254) {
    // Includes the 169.254.169.254 cloud metadata endpoint.
    return { blocked: true, category: "link-local" };
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return { blocked: true, category: "private" };
  }
  if (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) {
    return { blocked: true, category: "reserved" };
  }
  if (a === 192 && b === 88 && octets[2] === 99) {
    return { blocked: true, category: "reserved" };
  }
  if (a === 192 && b === 168) return { blocked: true, category: "private" };
  if (a === 198 && (b === 18 || b === 19)) {
    return { blocked: true, category: "reserved" };
  }
  if (a === 198 && b === 51 && octets[2] === 100) {
    return { blocked: true, category: "documentation" };
  }
  if (a === 203 && b === 0 && octets[2] === 113) {
    return { blocked: true, category: "documentation" };
  }
  if (a >= 224 && a <= 239) return { blocked: true, category: "multicast" };
  if (a >= 240) return { blocked: true, category: "reserved" };
  return { blocked: false, category: "public" };
}

// Expands an IPv6 literal into eight 16-bit groups. Returns null when the
// text is not a valid IPv6 address. Supports "::" compression and an
// embedded IPv4 tail ("::ffff:127.0.0.1").
function parseIpv6(hostname: string): number[] | null {
  let text = hostname;
  // Zone index (fe80::1%en0) — strip; link-local is blocked anyway.
  const zoneIndex = text.indexOf("%");
  if (zoneIndex !== -1) text = text.slice(0, zoneIndex);

  const embeddedIpv4 = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (embeddedIpv4?.[1] !== undefined && embeddedIpv4[2] !== undefined) {
    const tail = parseIpv4(embeddedIpv4[2]);
    if (!tail) return null;
    const [t0 = 0, t1 = 0, t2 = 0, t3 = 0] = tail;
    text =
      embeddedIpv4[1] +
      `${((t0 << 8) | t1).toString(16)}:${((t2 << 8) | t3).toString(16)}`;
  }

  const sections = text.split("::");
  if (sections.length > 2) return null;
  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(sections[0] ?? "");
  if (!head) return null;
  if (sections.length === 1) {
    return head.length === 8 ? head : null;
  }
  const tail = parseGroups(sections[1] ?? "");
  if (!tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

function classifyIpv6(groups: number[]): AddressVerdict {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] =
    groups;
  const embeddedIpv4 = (high: number, low: number): AddressVerdict =>
    classifyIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);

  if (groups.every((group) => group === 0)) {
    return { blocked: true, category: "unspecified" };
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0 && g6 === 0 && g7 === 1) {
      return { blocked: true, category: "loopback" };
    }
    if (g5 === 0xffff) {
      // IPv4-mapped — classify the embedded IPv4 address.
      return embeddedIpv4(g6, g7);
    }
    // Other low addresses (IPv4-compatible, deprecated) — fail closed.
    return { blocked: true, category: "reserved" };
  }
  if (g0 === 0x64 && g1 === 0xff9b) {
    // NAT64 well-known prefix — classify the embedded IPv4 address.
    const embedded = embeddedIpv4(g6, g7);
    return embedded.blocked ? embedded : { blocked: false, category: "nat64" };
  }
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) {
    return { blocked: true, category: "discard" };
  }
  if (g0 === 0x2001 && g1 === 0xdb8) {
    return { blocked: true, category: "documentation" };
  }
  if (g0 === 0x2001 && g1 === 0) {
    return { blocked: true, category: "teredo" };
  }
  if (g0 === 0x2002) {
    return { blocked: true, category: "6to4" };
  }
  if ((g0 & 0xfe00) === 0xfc00) {
    return { blocked: true, category: "unique-local" };
  }
  if ((g0 & 0xffc0) === 0xfe80) {
    return { blocked: true, category: "link-local" };
  }
  if ((g0 & 0xff00) === 0xff00) {
    return { blocked: true, category: "multicast" };
  }
  return { blocked: false, category: "public" };
}

// Classifies a resolved or literal address. Unparseable addresses fail closed.
export function classifyAddress(address: string): AddressVerdict {
  const stripped =
    address.startsWith("[") && address.endsWith("]")
      ? address.slice(1, -1)
      : address;
  const ipv4 = parseIpv4(stripped);
  if (ipv4) return classifyIpv4(ipv4);
  const ipv6 = parseIpv6(stripped);
  if (ipv6) return classifyIpv6(ipv6);
  return { blocked: true, category: "unparseable" };
}

export function isIpLiteral(hostname: string): boolean {
  const stripped =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return parseIpv4(stripped) !== null || parseIpv6(stripped) !== null;
}
