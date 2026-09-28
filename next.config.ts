import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp 为原生二进制模块，需声明为外部包，避免 Turbopack 打包成不存在的模块引用
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
