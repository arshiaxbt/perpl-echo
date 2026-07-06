import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
