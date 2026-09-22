import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Researchers upload collected data files (and analysts the report)
      // through Server Actions on /studies; the 1MB default is too small.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
