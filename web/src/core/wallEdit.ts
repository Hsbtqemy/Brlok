/**
 * Édition d'un pan (sans passer par Brlok desktop). Fonctions pures : elles renvoient un nouveau mur.
 */
import { clampLevel, createEmptyWall, holdAt, holdId, type Hold, type Position, type Wall } from "./wall";

/** Types de prise proposés (étiquettes) ; d'autres étiquettes libres restent possibles. */
export const HOLD_TYPES = ["bac", "réglette", "pince", "plat", "bi-doigt", "mono", "inversée", "volume"] as const;

export const MAX_ROWS = 30;
export const MAX_COLS = 26;

export type HoldPatch = Partial<Pick<Hold, "level" | "tags" | "active">>;

/** Ajoute ou modifie la prise à cette position (`null` : la retire). */
export function setHold(wall: Wall, position: Position, patch: HoldPatch | null): Wall {
  const existing = holdAt(wall, position);
  if (patch === null) {
    if (!existing) return wall;
    return {
      ...wall,
      holds: wall.holds.filter((h) => h !== existing),
      forbiddenLinks: wall.forbiddenLinks.filter(([a, b]) => a !== existing.id && b !== existing.id),
    };
  }
  if (existing) {
    const updated: Hold = {
      ...existing,
      ...patch,
      level: clampLevel(patch.level ?? existing.level),
      tags: patch.tags ? [...patch.tags] : existing.tags,
    };
    return { ...wall, holds: wall.holds.map((h) => (h === existing ? updated : h)) };
  }
  const hold: Hold = {
    id: holdId(position),
    level: clampLevel(patch.level ?? 1),
    tags: [...(patch.tags ?? [])],
    position: { ...position },
    active: patch.active ?? true,
  };
  return { ...wall, holds: [...wall.holds, hold] };
}

export function toggleTag(tags: readonly string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

/** Change la taille de la grille ; les prises hors de la nouvelle grille sont retirées (et listées). */
export function resizeWall(wall: Wall, rows: number, cols: number): { wall: Wall; removed: string[] } {
  const r = Math.max(1, Math.min(MAX_ROWS, Math.round(rows)));
  const c = Math.max(1, Math.min(MAX_COLS, Math.round(cols)));
  const kept = wall.holds.filter((h) => h.position.row < r && h.position.col < c);
  const keptIds = new Set(kept.map((h) => h.id));
  return {
    wall: {
      ...wall,
      rows: r,
      cols: c,
      holds: kept,
      forbiddenLinks: wall.forbiddenLinks.filter(([a, b]) => keptIds.has(a) && keptIds.has(b)),
    },
    removed: wall.holds.filter((h) => !keptIds.has(h.id)).map((h) => h.id),
  };
}

export function isForbidden(wall: Wall, a: string, b: string): boolean {
  return wall.forbiddenLinks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Marque (ou démarque) un enchaînement impossible entre deux prises. */
export function toggleForbiddenLink(wall: Wall, a: string, b: string): Wall {
  if (a === b) return wall;
  return {
    ...wall,
    forbiddenLinks: isForbidden(wall, a, b)
      ? wall.forbiddenLinks.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)))
      : [...wall.forbiddenLinks, [a, b]],
  };
}

export function linksOf(wall: Wall, id: string): string[] {
  return wall.forbiddenLinks.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
}

function newWallId(): string {
  return `pan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newWall(name: string, rows: number, cols: number, id = newWallId()): Wall {
  const { wall } = resizeWall(createEmptyWall(id, name.trim() || "Nouveau pan", 1, 1), rows, cols);
  return wall;
}

export function duplicateWall(wall: Wall, name: string, id = newWallId()): Wall {
  return { ...JSON.parse(JSON.stringify(wall)), id, name: name.trim() || `${wall.name} (copie)` };
}
