import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  // 启用 instrumentation hook
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
