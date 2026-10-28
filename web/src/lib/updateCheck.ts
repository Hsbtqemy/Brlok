/**
 * Mise à jour de l'app installée. Sur iPad et iPhone, une app ajoutée à l'écran d'accueil ne se recharge
 * presque jamais (elle reprend là où elle était) : on compare le script de la page chargée à celui de la
 * version en ligne, et l'app propose de se mettre à jour.
 */

/** Nom du script principal de la page chargée (il change à chaque version : `index-<empreinte>.js`). */
export function currentBuild(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return script ? (new URL(script.src).pathname.split("/").pop() ?? null) : null;
}

/** Nom du script principal de la version en ligne ; `null` hors ligne ou en cas d'échec. */
export async function latestBuild(): Promise<string | null> {
  try {
    // `maj` : le service worker laisse passer cette requête vers le réseau, sans la garder.
    const response = await fetch(`./index.html?maj=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.text()).match(/assets\/(index-[\w-]+\.js)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Vérification possible : app construite et servie (pas en développement). */
export const canCheckUpdates = () => import.meta.env.PROD && currentBuild() !== null;

export async function updateAvailable(): Promise<boolean> {
  const current = currentBuild();
  const latest = await latestBuild();
  return !!current && !!latest && current !== latest;
}
