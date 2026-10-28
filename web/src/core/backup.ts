/**
 * Sauvegarde complète (un fichier JSON) : murs avec leurs photos, joueurs, cotes, journal, partie en cours.
 * Sert à passer d'un appareil ou d'un hébergement à l'autre (page claude.ai → app installée), et de copie
 * de secours tant qu'il n'y a pas de synchronisation entre appareils.
 */
import { emptyRatingsState, type RatingsState } from "./players";
import { migrateWall, type Wall } from "./wall";

export const BACKUP_APP = "brlok-web";
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  walls: Wall[];
  ratings: RatingsState;
  liveGame: unknown | null;
}

export function makeBackup(walls: Wall[], ratings: RatingsState, liveGame: unknown | null, at = new Date().toISOString()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: at, walls, ratings, liveGame };
}

/** Lit une sauvegarde ; lève une erreur lisible si le fichier n'en est pas une. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Fichier illisible : ce n'est pas du JSON.");
  }
  const b = data as Partial<Backup>;
  if (!b || b.app !== BACKUP_APP || typeof b.version !== "number") {
    throw new Error("Ce fichier n'est pas une sauvegarde Brlok (pour un catalogue Brlok desktop, passe par Murs → Importer).");
  }
  if (b.version > BACKUP_VERSION) throw new Error("Sauvegarde faite par une version plus récente de l'app : mets l'app à jour d'abord.");
  if (!Array.isArray(b.walls) || typeof b.ratings !== "object" || b.ratings === null) {
    throw new Error("Sauvegarde incomplète (murs ou cotes manquants).");
  }
  const empty = emptyRatingsState();
  const r = b.ratings as Partial<RatingsState>;
  return {
    app: BACKUP_APP,
    version: b.version,
    exportedAt: String(b.exportedAt ?? ""),
    walls: b.walls.map(migrateWall),
    ratings: {
      players: r.players ?? empty.players,
      blocks: r.blocks ?? empty.blocks,
      attempts: r.attempts ?? empty.attempts,
      games: r.games ?? empty.games,
      bestTimes: r.bestTimes ?? empty.bestTimes,
    },
    liveGame: b.liveGame ?? null,
  };
}

/** Résumé pour confirmer avant de remplacer les données. */
export function describeBackup(b: Backup): string {
  const photos = b.walls.reduce((n, w) => n + (w.sectors?.filter((s) => s.photo).length ?? 0), 0);
  return [
    `${b.walls.length} mur(s)`,
    photos ? `${photos} photo(s)` : "",
    `${b.ratings.players.length} joueur(s)`,
    `${b.ratings.attempts.length} tentative(s)`,
    `${b.ratings.games.length} partie(s)`,
    b.liveGame ? "une partie en cours" : "",
  ]
    .filter(Boolean)
    .join(", ");
}
