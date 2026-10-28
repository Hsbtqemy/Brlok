import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  // Relatif : l'app fonctionne servie depuis n'importe quel dossier (et plus tard dans Tauri).
  base: "./",
  server: {
    // Autorise l'import du catalogue d'exemple de Brlok desktop (../data).
    fs: { allow: [".."] },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
