/** Persistance locale (navigateur). Toute lecture/écriture peut échouer : on retombe sur les valeurs par défaut. */
import { emptyRatingsState, type RatingsState } from "../core/players";
import type { Wall } from "../core/wall";

const WALLS_KEY = "brlok-web:walls";
const ACTIVE_KEY = "brlok-web:active-wall";
const RATINGS_KEY = "brlok-web:ratings";
const ACTIVE_PLAYER_KEY = "brlok-web:active-player";
const LIVE_GAME_KEY = "brlok-web:live-game";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée…) : l'app reste utilisable sans persistance.
  }
}

export const loadWalls = (): Wall[] => read(WALLS_KEY, []);
export const saveWalls = (walls: Wall[]): void => write(WALLS_KEY, walls);
export const loadActiveWallId = (): string | null => read(ACTIVE_KEY, null);
export const saveActiveWallId = (id: string): void => write(ACTIVE_KEY, id);
export const loadRatings = (): RatingsState => ({ ...emptyRatingsState(), ...read(RATINGS_KEY, {}) });
export const saveRatings = (state: RatingsState): void => write(RATINGS_KEY, state);
export const loadActivePlayerId = (): string | null => read(ACTIVE_PLAYER_KEY, null);
export const saveActivePlayerId = (id: string | null): void => write(ACTIVE_PLAYER_KEY, id);
export const loadLiveGame = <T>(): T | null => read<T | null>(LIVE_GAME_KEY, null);
export const saveLiveGame = (game: unknown): void => write(LIVE_GAME_KEY, game);
