/**
 * Modèle de mur générique (REGLES.md §13.4) : grille de taille quelconque,
 * prises (pan libre) et/ou voies fixes (mur à voies, plus tard).
 */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 6;

export interface Position {
  /** Index de ligne (0-based), même convention que Brlok desktop. */
  row: number;
  /** Index de colonne (0-based). */
  col: number;
}

export interface Hold {
  /** Identifiant affiché, ex. « C1 » (lettre de colonne + numéro de ligne). */
  id: string;
  /** Difficulté 1–6. */
  level: number;
  tags: string[];
  position: Position;
  active: boolean;
}

/** Voie existante d'un mur de salle (couleur + cotation). Non utilisée en v1. */
export interface Route {
  id: string;
  name: string;
  color: string;
  grade: string;
  styles: string[];
}

export type WallKind = "pan" | "voies";

export interface Wall {
  id: string;
  name: string;
  kind: WallKind;
  rows: number;
  cols: number;
  /**
   * Ligne qui correspond au bas du mur. Brlok desktop affiche la ligne 0 en haut,
   * donc par défaut le bas du mur est la dernière ligne.
   */
  bottom: "first" | "last";
  holds: Hold[];
  routes: Route[];
  /** Portée max (en cases, distance de Tchebychev) entre deux prises d'un bloc. */
  reach: number;
  /** Enchaînements marqués impossibles à la main (paires d'ids, ordre indifférent). */
  forbiddenLinks: [string, string][];
}

export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

/** Lettre(s) de colonne : 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(col: number): string {
  let label = "";
  let n = col;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function holdId(position: Position): string {
  return `${columnLabel(position.col)}${position.row + 1}`;
}

export function createEmptyWall(id: string, name: string, rows: number, cols: number): Wall {
  return {
    id,
    name,
    kind: "pan",
    rows,
    cols,
    bottom: "last",
    holds: [],
    routes: [],
    reach: 2,
    forbiddenLinks: [],
  };
}

/** Déplacement « vers le haut » en index de ligne selon l'orientation du mur. */
export function upDirection(wall: Wall): 1 | -1 {
  return wall.bottom === "last" ? -1 : 1;
}

export function holdAt(wall: Wall, position: Position): Hold | undefined {
  return wall.holds.find((h) => h.position.row === position.row && h.position.col === position.col);
}

export function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Graphe de portée : prises actives reliées si elles sont à portée et non interdites (REGLES.md §7.4). */
export function reachGraph(wall: Wall): Map<string, Hold[]> {
  const forbidden = new Set(wall.forbiddenLinks.map(([a, b]) => linkKey(a, b)));
  const active = wall.holds.filter((h) => h.active);
  const graph = new Map<string, Hold[]>();
  for (const h of active) {
    graph.set(
      h.id,
      active.filter(
        (o) =>
          o.id !== h.id &&
          distance(h.position, o.position) <= wall.reach &&
          !forbidden.has(linkKey(h.id, o.id)),
      ),
    );
  }
  return graph;
}
