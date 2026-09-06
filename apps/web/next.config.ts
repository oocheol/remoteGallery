import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gallery/shared", "@gallery/three"],
};

export default nextConfig;
