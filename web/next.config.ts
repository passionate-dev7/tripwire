import type { NextConfig } from "next";

// Static export only: the Vercel deployment carries zero functions. /api/* is proxied by vercel.json rewrites to the
// keeper on the Mac mini (scripts/build-static.sh writes it).
const nextConfig: NextConfig = { output: "export", images: { unoptimized: true }, trailingSlash: false };

export default nextConfig;
