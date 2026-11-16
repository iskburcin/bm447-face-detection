import type { NextConfig } from "next";

/**
 * Üç dağıtım hedefi, tek kod:
 *  - Vercel / yerel (npm run build)      : normal Next.js çıktısı
 *  - Docker                              : output "standalone" (küçük Node sunucusu)
 *  - GitHub Pages (npm run build:pages)  : output "export" -> out/ klasöründe tamamen statik site,
 *                                          https://<kullanıcı>.github.io/<repo>/ alt yolu için basePath
 */
const pages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: pages ? "export" : "standalone",
  basePath: basePath || undefined,
  trailingSlash: pages, // /tespit -> /tespit/index.html (GitHub Pages için)
  images: { unoptimized: true },
  reactStrictMode: true,
  agentRules: false, // next dev'in AGENTS.md üretmesini kapat
  ...(pages
    ? {}
    : {
        async headers() {
          return [
            {
              // Büyük statik varlıklar (model, wasm, opencv.js) uzun süre önbelleğe alınsın.
              source: "/:dir(models|vendor)/:path*",
              headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
            },
          ];
        },
      }),
};

export default nextConfig;
