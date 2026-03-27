import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  turbopack: { root: path.resolve(import.meta.dirname) },
  async rewrites() {
    return [
      // LangGraph orchestrator (priority — must come first)
      {
        source: "/orchestrator/:path*",
        destination: "http://localhost:3100/api/:path*",
      },
      // Legacy AES backend
      {
        source: "/api/:path*",
        destination: "http://localhost:4100/api/:path*",
      },
    ];
  },
};

export default nextConfig;
