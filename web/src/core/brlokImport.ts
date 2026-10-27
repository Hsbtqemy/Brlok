/**
 * Import / export au format JSON de Brlok desktop (catalog_collection.json),
 * pour que les deux versions partagent leurs données.
 */
import { clampLevel, holdAt, holdId, type Hold, type Wall } from "./wall";

interface BrlokHold {
  id: string;
  level: number;
  tags?: string[];
  position: { row: number; col: number };
  active?: boolean;
}

interface BrlokCatalog {
  holds: BrlokHold[];
  grid: { rows: number; cols: number };
  foot_grid?: string[][];
  foot_levels?: number[][];
}

interface BrlokCatalogEntry {
  id: string;
  name: string;
  catalog: BrlokCatalog;
}

export interface BrlokCatalogCollection {
  catalogs: BrlokCatalogEntry[];
  active_id?: string;
}

export interface ImportOptions {
  /**
   * Fusion de la grille pieds (REGLES.md §7.3) : la rangée 0 de la grille pieds
   * correspond à cette rangée de la grille des mains. `null` = ne pas fusionner.
   */
  footRowOffset: number | null;
}

export interface FootMerge {
  holdId: string;
  spec: string;
  previousLevel: number | null;
  level: number;
}

export interface ImportedWall {
  wall: Wall;
  footMerges: FootMerge[];
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { footRowOffset: 0 };

function isCollection(data: unknown): data is BrlokCatalogCollection {
  return typeof data === "object" && data !== null && Array.isArray((data as BrlokCatalogCollection).catalogs);
}

function isCatalog(data: unknown): data is BrlokCatalog {
  return typeof data === "object" && data !== null && Array.isArray((data as BrlokCatalog).holds);
}

/** Accepte une collection (catalog_collection.json) ou un catalogue seul. */
export function importBrlok(data: unknown, options: ImportOptions = DEFAULT_IMPORT_OPTIONS): ImportedWall[] {
  if (isCollection(data)) {
    return data.catalogs.map((entry) => importCatalog(entry.id, entry.name, entry.catalog, options));
  }
  if (isCatalog(data)) {
    return [importCatalog("catalogue", "Catalogue importé", data, options)];
  }
  throw new Error("Fichier non reconnu : ni collection de catalogues Brlok, ni catalogue.");
}

function importCatalog(id: string, name: string, catalog: BrlokCatalog, options: ImportOptions): ImportedWall {
  const wall: Wall = {
    id,
    name,
    kind: "pan",
    rows: catalog.grid?.rows ?? 7,
    cols: catalog.grid?.cols ?? 6,
    bottom: "last",
    holds: catalog.holds.map(
      (h): Hold => ({
        id: h.id,
        level: clampLevel(h.level),
        tags: [...(h.tags ?? [])],
        position: { row: h.position.row, col: h.position.col },
        active: h.active ?? true,
      }),
    ),
    routes: [],
    reach: 2,
    forbiddenLinks: [],
  };
  const footMerges =
    options.footRowOffset === null ? [] : mergeFootGrid(wall, catalog.foot_grid, catalog.foot_levels, options.footRowOffset);
  return { wall, footMerges };
}

/**
 * La grille pieds de Brlok reprend des prises de la grille des mains : on la fusionne par-dessus,
 * le type de prise devient une étiquette et on garde le plus haut des deux niveaux.
 */
export function mergeFootGrid(
  wall: Wall,
  footGrid: string[][] | undefined,
  footLevels: number[][] | undefined,
  rowOffset: number,
): FootMerge[] {
  if (!footGrid) return [];
  const merges: FootMerge[] = [];
  footGrid.forEach((cells, r) => {
    cells.forEach((rawSpec, c) => {
      const spec = (rawSpec ?? "").trim();
      if (!spec) return;
      const position = { row: r + rowOffset, col: c };
      if (position.row < 0 || position.row >= wall.rows || position.col >= wall.cols) return;
      const footLevel = clampLevel(footLevels?.[r]?.[c] ?? 1);
      const existing = holdAt(wall, position);
      if (existing) {
        const previousLevel = existing.level;
        existing.level = Math.max(existing.level, footLevel);
        if (!existing.tags.includes(spec)) existing.tags.push(spec);
        merges.push({ holdId: existing.id, spec, previousLevel, level: existing.level });
      } else {
        const hold: Hold = { id: holdId(position), level: footLevel, tags: [spec], position, active: true };
        wall.holds.push(hold);
        merges.push({ holdId: hold.id, spec, previousLevel: null, level: footLevel });
      }
    });
  });
  return merges;
}

/**
 * Export vers Brlok desktop. Brlok desktop limite les prises de main au niveau 5 :
 * les prises de niveau 6 sont ramenées à 5 et listées dans `clamped`.
 */
export function exportBrlok(walls: readonly Wall[], activeId?: string): { data: BrlokCatalogCollection; clamped: string[] } {
  const clamped: string[] = [];
  const catalogs = walls.map((wall) => ({
    id: wall.id,
    name: wall.name,
    catalog: {
      grid: { rows: wall.rows, cols: wall.cols },
      holds: wall.holds.map((h) => {
        if (h.level > 5) clamped.push(`${wall.name} / ${h.id}`);
        return { id: h.id, level: Math.min(5, h.level), tags: [...h.tags], position: { ...h.position }, active: h.active };
      }),
    },
  }));
  return { data: { catalogs, active_id: activeId ?? walls[0]?.id ?? "" }, clamped };
}
