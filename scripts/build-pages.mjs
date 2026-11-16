// GitHub Pages için statik dışa aktarma: GITHUB_PAGES=true + basePath ile `next build` -> out/
// Kullanım: npm run build:pages            (basePath varsayılan: /bm447-face-detection)
//           PAGES_BASE_PATH=/repo-adi npm run build:pages
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const base = process.env.PAGES_BASE_PATH ?? "/bm447-face-detection";
const env = { ...process.env, GITHUB_PAGES: "true", NEXT_PUBLIC_BASE_PATH: base };
const r = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);

// Next 16 dışa aktarımı segment yüklerini "__next.tespit/__PAGE__.txt" olarak yazıyor, ancak istemci
// ön yüklemede "__next.tespit.__PAGE__.txt" istiyor. Statik sunucuda (GitHub Pages) yeniden yazma
// kuralı olmadığı için düzleştirilmiş kopyalar oluşturulur; aksi hâlde sayfa geçişleri tam yüklemeye düşer.
let flat = 0;
const walkFiles = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walkFiles(join(d, n)) : [join(d, n)]));
const visit = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) continue;
    if (n.startsWith("__next.")) {
      for (const f of walkFiles(p)) {
        const target = join(dir, n + "." + relative(p, f).split(sep).join("."));
        if (!existsSync(target)) { copyFileSync(f, target); flat++; }
      }
    } else visit(p);
  }
};
visit("out");
writeFileSync("out/.nojekyll", ""); // _next/ klasörünün Jekyll tarafından gizlenmesini engeller
console.log(`[build-pages] out/ hazır (basePath=${base || "/"}, ${flat} segment dosyası düzleştirildi)`);
