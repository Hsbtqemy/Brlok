/**
 * Modèle de mur générique (REGLES.md §13.5) : grille de taille quelconque,
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

/** Prise d'une voie sur la photo. */
export interface RouteMark {
  x: number;
  y: number;
  role?: "depart" | "top";
  /** Rang dans l'enchaînement imposé (1, 2, 3…) ; absent : prise libre. */
  n?: number;
}

/**
 * Ordre des prises : toucher une prise sans numéro lui donne le suivant ; toucher une prise numérotée
 * lui retire son numéro, et les suivantes remontent d'un cran.
 */
export function toggleOrder(marks: readonly RouteMark[], index: number): RouteMark[] {
  const target = marks[index];
  if (!target) return [...marks];
  if (target.n === undefined) {
    const next = Math.max(0, ...marks.map((m) => m.n ?? 0)) + 1;
    return marks.map((m, i) => (i === index ? { ...m, n: next } : m));
  }
  const removed = target.n;
  return marks.map((m, i) => {
    if (i === index) {
      const { n: _n, ...rest } = m;
      return rest;
    }
    return m.n !== undefined && m.n > removed ? { ...m, n: m.n - 1 } : m;
  });
}

/** Numérote toutes les prises de bas en haut ; les départs d'abord, le top en dernier. */
export function autoOrder(marks: readonly RouteMark[]): RouteMark[] {
  const rank = (m: RouteMark) => (m.role === "depart" ? 0 : m.role === "top" ? 2 : 1);
  const sorted = marks.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || b.m.y - a.m.y || a.m.x - b.m.x);
  const n = new Map(sorted.map(({ i }, k) => [i, k + 1]));
  return marks.map((m, i) => ({ ...m, n: n.get(i)! }));
}

export function clearOrder(marks: readonly RouteMark[]): RouteMark[] {
  return marks.map(({ n: _n, ...m }) => m);
}

/** Prises numérotées, dans l'ordre de l'enchaînement. */
export function orderedMarks(marks: readonly RouteMark[] | undefined): RouteMark[] {
  return (marks ?? []).filter((m) => m.n !== undefined).sort((a, b) => a.n! - b.n!);
}

/** Libellé d'une prise sur la photo : son rang, sinon D (départ) ou T (top). */
export function markLabel(m: RouteMark): string {
  return m.n !== undefined ? String(m.n) : m.role === "depart" ? "D" : m.role === "top" ? "T" : "";
}

/** Voie d'un mur de salle (mode salle, MURS.md étape 3). */
export interface Route {
  id: string;
  /** Nom ou numéro affiché (facultatif). */
  name: string;
  /** Nom de la couleur des prises (ex. « vert »). */
  color: string;
  /** Teinte affichée (prélevée sur la photo, ou couleur type). */
  colorHex?: string;
  /** Cotation, échelle Font (ex. « 6a+ »), ou « ? » si inconnue. */
  grade: string;
  styles: string[];
  /** Voie démontée : gardée pour l'historique, plus proposée. */
  archived?: boolean;
  /** Prises de la voie sur la photo du secteur (coordonnées de 0 à 1) ; départ(s) et top signalés. */
  marks?: RouteMark[];
  /** Secteur (photo) de la voie ; absent : le premier secteur du mur. */
  sectorId?: string;
  createdAt?: string;
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
  /** Mur à voies : secteurs, chacun avec sa photo. */
  sectors?: Sector[];
  /** Ancien format (une seule photo) : repris comme premier secteur par `migrateWall`. */
  photo?: string;
}

/** Secteur d'un mur à voies : une photo (image réduite, data URL) et un nom. */
export interface Sector {
  id: string;
  name: string;
  photo?: string;
}

/** Ancien format à une photo → un secteur. Sans effet sur un mur déjà à jour. */
export function migrateWall(wall: Wall): Wall {
  if (!wall.photo || wall.sectors?.length) return wall;
  const { photo, ...rest } = wall;
  return { ...rest, sectors: [{ id: "s1", name: "Secteur 1", photo }] };
}

/** Secteur d'une voie (le premier si la voie n'en désigne pas, ou un secteur supprimé). */
export function sectorOf(wall: Wall, route: Route): Sector | undefined {
  const sectors = migrateWall(wall).sectors ?? [];
  return sectors.find((s) => s.id === route.sectorId) ?? sectors[0];
}

/** Photo d'une voie (celle de son secteur). */
export function routePhoto(wall: Wall, route: Route): string | undefined {
  return sectorOf(wall, route)?.photo;
}

/** Photos à ranger à part (stockage) : le mur sans ses photos, et les photos avec leur clé. */
export function splitPhotos(wall: Wall): { wall: Wall; photos: { sectorId: string; data: string }[] } {
  const w = migrateWall(wall);
  if (!w.sectors?.some((s) => s.photo)) return { wall: w, photos: [] };
  return {
    wall: { ...w, sectors: w.sectors.map(({ photo: _photo, ...s }) => s) },
    photos: w.sectors.filter((s) => s.photo).map((s) => ({ sectorId: s.id, data: s.photo! })),
  };
}

/** Remet les photos rangées à part dans leurs secteurs. */
export function joinPhotos(wall: Wall, photoOf: (sectorId: string) => string | undefined): Wall {
  const w = migrateWall(wall);
  if (!w.sectors?.length) return w;
  return { ...w, sectors: w.sectors.map((s) => ({ ...s, photo: s.photo ?? photoOf(s.id) })) };
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
