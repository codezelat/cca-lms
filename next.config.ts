import type { NextConfig } from "next";

// Set global server timezone to Sri Lanka
process.env.TZ = "Asia/Colombo";
const isDevelopmentBuild = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  experimental: {
    ...(isDevelopmentBuild
      ? {
          allowDevelopmentBuild: true,
          prerenderEarlyExit: false,
        }
      : {}),
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      ...(process.env.R2_PUBLIC_URL
        ? [
            {
              protocol: "https" as const,
              hostname: process.env.R2_PUBLIC_URL.replace("https://", ""),
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
