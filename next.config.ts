import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "googleapis"],
  outputFileTracingRoot: path.join(process.cwd()),
  allowedDevOrigins: ["172.24.0.1"],
};

export default nextConfig;