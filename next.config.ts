import type { NextConfig } from "next";

const permissionsPolicyHeader = [
  {
    key: "Permissions-Policy",
    value: "camera=(self)",
  },
];

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals ?? [];
      if (Array.isArray(externals)) {
        externals.push({ pdfkit: "commonjs pdfkit" });
        config.externals = externals;
      } else {
        config.externals = [externals, { pdfkit: "commonjs pdfkit" }];
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: permissionsPolicyHeader,
      },
    ];
  },
};

export default nextConfig;
