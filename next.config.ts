import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/permit/[...path]': ['./data/permit-templates/*.pdf', './public/fonts/NotoSansThai.ttf'], '/api/ppe/requests': ['./public/fonts/NotoSansThai.ttf'] },
};

export default nextConfig;
