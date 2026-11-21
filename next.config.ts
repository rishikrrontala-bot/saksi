import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build run next to `next dev` locally (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
