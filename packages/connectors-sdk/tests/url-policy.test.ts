import { describe, expect, it } from "vitest";
import {
  classifyAddress,
  isIpLiteral,
  normalizeTargetUrl,
} from "../src/web-page-capture/url-policy.js";
import {
  decodeEntities,
  extractCanonicalUrl,
  extractReadableText,
  extractTitle,
} from "../src/web-page-capture/extract-text.js";

describe("normalizeTargetUrl", () => {
  it("accepts http and https targets", () => {
    expect(normalizeTargetUrl("https://example.com/page?q=1").ok).toBe(true);
    expect(normalizeTargetUrl("http://example.com").ok).toBe(true);
  });

  it("rejects non-http schemes", () => {
    for (const raw of [
      "ftp://example.com/file",
      "file:///etc/passwd",
      "gopher://example.com",
      "javascript:alert(1)",
    ]) {
      const verdict = normalizeTargetUrl(raw);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.errorCode).toBe("UNSUPPORTED_SCHEME");
    }
  });

  it("rejects embedded credentials", () => {
    const verdict = normalizeTargetUrl("https://user:secret@example.com/");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errorCode).toBe("BLOCKED_TARGET");
  });

  it("rejects unparseable input", () => {
    const verdict = normalizeTargetUrl("not a url");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errorCode).toBe("INVALID_URL");
  });

  it("strips fragments", () => {
    const verdict = normalizeTargetUrl("https://example.com/a#section");
    expect(verdict.ok && verdict.url.hash).toBe("");
  });

  it("canonicalizes exotic IPv4 spellings so they classify as blocked", () => {
    // The WHATWG parser turns hex/octal/integer hosts into dotted quads.
    for (const raw of [
      "http://0x7f000001/",
      "http://2130706433/",
      "http://017700000001/",
    ]) {
      const verdict = normalizeTargetUrl(raw);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) {
        expect(classifyAddress(verdict.url.hostname).blocked).toBe(true);
      }
    }
  });
});

describe("classifyAddress IPv4", () => {
  const blocked = [
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["10.0.0.1", "private"],
    ["172.16.0.5", "private"],
    ["172.31.255.1", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "link-local"],
    ["169.254.0.1", "link-local"],
    ["100.64.0.1", "carrier-grade-nat"],
    ["100.127.255.254", "carrier-grade-nat"],
    ["0.0.0.0", "this-network"],
    ["192.0.0.1", "reserved"],
    ["192.0.2.1", "reserved"],
    ["192.88.99.1", "reserved"],
    ["198.18.0.1", "reserved"],
    ["198.51.100.7", "documentation"],
    ["203.0.113.9", "documentation"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "reserved"],
  ] as const;

  it.each(blocked)("blocks %s (%s)", (address, category) => {
    const verdict = classifyAddress(address);
    expect(verdict.blocked).toBe(true);
    expect(verdict.category).toBe(category);
  });

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1"];
  it.each(allowed)("allows public %s", (address) => {
    expect(classifyAddress(address).blocked).toBe(false);
  });
});

describe("classifyAddress IPv6", () => {
  const blocked = [
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fe80::1", "link-local"],
    ["fc00::1", "unique-local"],
    ["fd12:3456:789a::1", "unique-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["2001:0:1::1", "teredo"],
    ["2002:7f00:1::1", "6to4"],
    ["100::1", "discard"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:169.254.169.254", "link-local"],
    ["64:ff9b::7f00:1", "loopback"],
    ["64:ff9b::a00:1", "private"],
    ["::2", "reserved"],
  ] as const;

  it.each(blocked)("blocks %s (%s)", (address, category) => {
    const verdict = classifyAddress(address);
    expect(verdict.blocked).toBe(true);
    expect(verdict.category).toBe(category);
  });

  it("allows global unicast and NAT64 with public embedded address", () => {
    expect(classifyAddress("2606:4700:4700::1111").blocked).toBe(false);
    expect(classifyAddress("64:ff9b::808:808").blocked).toBe(false);
  });

  it("handles bracketed literals and zone indexes", () => {
    expect(classifyAddress("[::1]").blocked).toBe(true);
    expect(classifyAddress("fe80::1%en0").blocked).toBe(true);
  });

  it("fails closed on unparseable addresses", () => {
    expect(classifyAddress("not-an-address").blocked).toBe(true);
    expect(classifyAddress("1:2:3:4:5:6:7:8:9").blocked).toBe(true);
    expect(classifyAddress("1::2::3").blocked).toBe(true);
  });
});

describe("isIpLiteral", () => {
  it("detects literals and hostnames", () => {
    expect(isIpLiteral("127.0.0.1")).toBe(true);
    expect(isIpLiteral("[::1]")).toBe(true);
    expect(isIpLiteral("example.com")).toBe(false);
  });
});

describe("text extraction", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(decodeEntities("a &amp; b &#60;c&#x3E; &nbsp;")).toBe("a & b <c>  ");
  });

  it("extracts the title", () => {
    expect(
      extractTitle("<html><head><title> Hello &amp; World </title></head></html>"),
    ).toBe("Hello & World");
    expect(extractTitle("<html><body>no title</body></html>")).toBeNull();
  });

  it("extracts the canonical URL resolved against the page", () => {
    const html = '<head><link rel="canonical" href="/canonical-page"></head>';
    expect(extractCanonicalUrl(html, "https://example.com/a/b")).toBe(
      "https://example.com/canonical-page",
    );
    expect(extractCanonicalUrl("<head></head>", "https://example.com")).toBeNull();
  });

  it("drops script and style content and keeps readable text", () => {
    const html = `
      <html><head><style>body { color: red }</style></head>
      <body>
        <script>document.cookie = "evil";</script>
        <h1>Heading</h1>
        <p>First paragraph with <b>bold</b> text.</p>
        <noscript>fallback</noscript>
      </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("Heading");
    expect(text).toContain("First paragraph with bold text.");
    expect(text).not.toContain("document.cookie");
    expect(text).not.toContain("color: red");
    expect(text).not.toContain("fallback");
  });
});
