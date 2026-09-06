import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include current Next runtime modules that the deployment adapter may omit.
  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/next/dist/lib/**/*.js",
      "../../node_modules/next/dist/server/**/*.js",
      "../../node_modules/next/dist/shared/**/*.js",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "../../.gallery-twin/**/*",
      "../../work/**/*",
      "../../services/reconstruction/.venv/**/*",
      "../../*.mov",
      "../../*.heic",
      "../../.vercel/**/*",
      "../../.env*",
    ],
  },
  serverExternalPackages: ["heic-convert", "libheif-js"],
  transpilePackages: ["@gallery/shared", "@gallery/three"],
};

export default nextConfig;
