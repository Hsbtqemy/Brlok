// Transforme dist-single/index.html en contenu de page partagée claude.ai :
// sans doctype/html/head/body (ajoutés à la publication), titre en tête, script après #app.
// Usage : node scripts/artifact-page.mjs <fichier de sortie>
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("Usage : node scripts/artifact-page.mjs <fichier de sortie>");
const html = readFileSync(new URL("../dist-single/index.html", import.meta.url), "utf8");

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error(`${label} introuvable dans dist-single/index.html`);
  return m[0];
};
const styles = html.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
const script = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/, "script");

const page = [
  "<title>Brlok Chesscalade</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...styles,
  '<div id="app"></div>',
  script,
  "",
].join("\n");
writeFileSync(out, page);
console.log(`${out} : ${(page.length / 1024).toFixed(0)} Ko`);
