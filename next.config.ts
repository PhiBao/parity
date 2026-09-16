import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The data-heavy pages render at request time (every upstream call is
  // cached in-process), so there is no reason to fetch during the build.
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;
