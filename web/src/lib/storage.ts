/** Persistance locale (navigateur). Toute lecture/écriture peut échouer : on retombe sur les valeurs par défaut. */
import { emptyRatingsState, type RatingsState } from "../core/players";
import { ROUTE_VARIANTS, type RouteVariant } from "../core/gym";
import { joinPhotos, splitPhotos, type Wall } from "../core/wall";

const WALLS_KEY = "brlok-web:walls";
const ACTIVE_KEY = "brlok-web:active-wall";
const RATINGS_KEY = "brlok-web:ratings";
const ACTIVE_PLAYER_KEY = "brlok-web:active-player";
const LIVE_GAME_KEY = "brlok-web:live-game";
const ROUTE_VARIANTS_OFF_KEY = "brlok-web:route-variants-off";

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

// Les photos des secteurs sont rangées chacune sous sa clé : le mur s'enregistre à chaque retouche,
// les photos seulement quand elles changent.
const PHOTO_PREFIX = "brlok-web:photo:";
const photoKey = (wallId: string, sectorId: string) => `${PHOTO_PREFIX}${wallId}:${sectorId}`;

export const loadWalls = (): Wall[] =>
  read<Wall[]>(WALLS_KEY, []).map((w) => joinPhotos(w, (sectorId) => read<string | undefined>(photoKey(w.id, sectorId), undefined)));

export function saveWalls(walls: Wall[]): void {
  const keep = new Set<string>();
  const stripped = walls.map((w) => {
    const { wall, photos } = splitPhotos(w);
    for (const p of photos) {
      const key = photoKey(w.id, p.sectorId);
      keep.add(key);
      if (read<string | undefined>(key, undefined) !== p.data) write(key, p.data);
    }
    return wall;
  });
  write(WALLS_KEY, stripped);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PHOTO_PREFIX) && !keep.has(key)) localStorage.removeItem(key);
    }
  } catch {
    // stockage indisponible
  }
}
export const loadActiveWallId = (): string | null => read(ACTIVE_KEY, null);
export const saveActiveWallId = (id: string): void => write(ACTIVE_KEY, id);
export const loadRatings = (): RatingsState => ({ ...emptyRatingsState(), ...read(RATINGS_KEY, {}) });
export const saveRatings = (state: RatingsState): void => write(RATINGS_KEY, state);
export const loadActivePlayerId = (): string | null => read(ACTIVE_PLAYER_KEY, null);
export const saveActivePlayerId = (id: string | null): void => write(ACTIVE_PLAYER_KEY, id);
export const loadLiveGame = <T>(): T | null => read<T | null>(LIVE_GAME_KEY, null);
export const saveLiveGame = (game: unknown): void => write(LIVE_GAME_KEY, game);

/** Variantes de voie permises dans les parties (toutes par défaut). */
// On retient les variantes écartées : une variante ajoutée plus tard est permise d'office.
export function loadRouteVariants(): RouteVariant[] {
  const off = new Set(read<RouteVariant[]>(ROUTE_VARIANTS_OFF_KEY, []));
  return ROUTE_VARIANTS.map((v) => v.id).filter((id) => !off.has(id));
}
export const saveRouteVariants = (variants: RouteVariant[]): void =>
  write(
    ROUTE_VARIANTS_OFF_KEY,
    ROUTE_VARIANTS.map((v) => v.id).filter((id) => !variants.includes(id)),
  );
