import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/permit/[...path]': ['./data/permit-templates/*.pdf'] },
};

export default nextConfig;
