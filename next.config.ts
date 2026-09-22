import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Researchers upload collected data files (and analysts the report)
      // through Server Actions on /studies; the 1MB default is too small.
      // Files are capped at 4MB per submission (Vercel's body limit is
      // 4.5MB), plus room for the multipart overhead.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
