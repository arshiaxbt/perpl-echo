import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" }
    ]
  },
  experimental: {
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
