import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

export default mount(App, { target: document.getElementById("app")! });

// App installée (PWA) : fonctionnement hors ligne. Pas dans la page unique (claude.ai, fichier local),
// ni dans un cadre, ni en développement.
if (import.meta.env.PROD && import.meta.env.MODE !== "single" && "serviceWorker" in navigator && window.top === window) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // sans hors ligne : l'app reste utilisable
    });
  });
}
