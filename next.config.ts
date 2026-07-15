import type { NextConfig } from "next";

import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "googleapis"],
  outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;
