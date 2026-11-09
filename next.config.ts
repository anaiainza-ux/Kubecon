import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical", "@elastic/elasticsearch"],
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
