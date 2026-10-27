import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode single` : une seule page HTML autonome (JS et CSS intégrés),
// pour l'ouvrir sur une tablette sans serveur ou la publier comme page partagée.
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [svelte(), viteSingleFile()] : [svelte()],
  // Relatif : l'app fonctionne servie depuis n'importe quel dossier (et plus tard dans Tauri).
  base: "./",
  build: mode === "single" ? { outDir: "dist-single" } : {},
  server: {
    // Autorise l'import du catalogue d'exemple de Brlok desktop (../data).
    fs: { allow: [".."] },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
}));
