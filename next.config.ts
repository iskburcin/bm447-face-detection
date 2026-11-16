import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker için: .next/standalone altında bağımsız bir Node sunucusu üretir.
  output: "standalone",
  reactStrictMode: true,
  agentRules: false, // next dev'in AGENTS.md üretmesini kapat
  async headers() {
    return [
      {
        // Büyük statik varlıklar (model, wasm, opencv.js) uzun süre önbelleğe alınsın.
        source: "/:dir(models|vendor)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
