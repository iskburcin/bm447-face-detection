/**
 * Alt yol (basePath) desteği. GitHub Pages'te site https://<kullanıcı>.github.io/<repo>/ altında
 * yayınlanır; statik dosyaların (model, veri, WASM, şekiller) yolları bu öneki almalıdır.
 * Vercel / Docker / yerelde boş string'tir.
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
