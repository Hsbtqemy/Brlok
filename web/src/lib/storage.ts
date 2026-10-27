/** Persistance locale (navigateur). Toute lecture/écriture peut échouer : on retombe sur les valeurs par défaut. */
import type { Wall } from "../core/wall";

const WALLS_KEY = "brlok-web:walls";
const ACTIVE_KEY = "brlok-web:active-wall";

export function loadWalls(): Wall[] {
  try {
    const raw = localStorage.getItem(WALLS_KEY);
    return raw ? (JSON.parse(raw) as Wall[]) : [];
  } catch {
    return [];
  }
}

export function saveWalls(walls: Wall[]): void {
  try {
    localStorage.setItem(WALLS_KEY, JSON.stringify(walls));
  } catch {
    // Stockage indisponible (navigation privée…) : l'app reste utilisable sans persistance.
  }
}

export function loadActiveWallId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveWallId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // idem
  }
}
