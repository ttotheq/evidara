import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  async rewrites() {
    // Same-origin proxy so the path-scoped session cookie (/v1) works
    // without cross-origin requests from the browser.
    return [{ source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` }];
  },
};

export default nextConfig;
