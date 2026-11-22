import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Chrome asks for this whenever DevTools is open; the 404s are noise.
  logging: {
    incomingRequests: { ignore: [/\/\.well-known\/appspecific\/com\.chrome\.devtools\.json/] },
  },
  distDir: process.env.NEXT_TEST_DIST_DIR || ".next",
  // Test builds skip type checking; `bun run typecheck` covers it.
  typescript: { ignoreBuildErrors: Boolean(process.env.NEXT_TEST_DIST_DIR) },
};

export default nextConfig;
