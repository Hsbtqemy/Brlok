/**
 * Mode salle (MURS.md étape 3) : un mur à voies. Les blocs ne sont pas générés, ils sont **choisis**
 * parmi les voies en place, selon la cote visée et le caractère de la pièce.
 */
import { distributionLevels, type DistributionPattern } from "./distribution";
import type { Block } from "./generator";
import type { Piece } from "./pieces";
import type { Rng } from "./random";
import type { Route, Wall } from "./wall";

/** Cotation (bloc, échelle Font) → cote de départ (REGLES.md §13.3), corrigée ensuite par Glicko-2. */
export const GRADES: { grade: string; rating: number }[] = [
  { grade: "3", rating: 800 },
  { grade: "4", rating: 900 },
  { grade: "4+", rating: 1000 },
  { grade: "5a", rating: 1100 },
  { grade: "5b", rating: 1200 },
  { grade: "5c", rating: 1300 },
  { grade: "6a", rating: 1400 },
  { grade: "6a+", rating: 1450 },
  { grade: "6b", rating: 1500 },
  { grade: "6b+", rating: 1600 },
  { grade: "6c", rating: 1700 },
  { grade: "6c+", rating: 1800 },
  { grade: "7a", rating: 1900 },
  { grade: "7a+", rating: 2000 },
  { grade: "7b", rating: 2100 },
  { grade: "7b+", rating: 2150 },
  { grade: "7c", rating: 2250 },
  { grade: "7c+", rating: 2350 },
  { grade: "8a", rating: 2450 },
];

/** Cotation inconnue : on part du milieu, Glicko-2 fera le reste. */
export const UNKNOWN_GRADE_RATING = 1500;

export function gradeToRating(grade: string): number {
  return GRADES.find((g) => g.grade === grade.trim().toLowerCase())?.rating ?? UNKNOWN_GRADE_RATING;
}

export const STYLES = [
  "dalle",
  "vertical",
  "dévers",
  "toit",
  "dynamique",
  "traversée",
  "diagonale",
  "compact",
  "long",
  "réglettes",
  "plats",
  "compression",
  "technique",
] as const;

/** Caractère des pièces traduit en styles de voie (REGLES.md §7.1, MURS.md). */
export const PIECE_STYLES: Record<Piece, string[]> = {
  pion: ["dalle", "vertical"],
  cavalier: ["dynamique"],
  fou: ["diagonale", "technique"],
  tour: ["traversée", "vertical"],
  dame: ["long", "dévers", "toit"],
  roi: ["compact", "compression"],
};

/** Couleurs de prises courantes en salle (nom → teinte affichée). */
export const ROUTE_COLORS: { name: string; hex: string }[] = [
  { name: "jaune", hex: "#f2c500" },
  { name: "orange", hex: "#f57c00" },
  { name: "rouge", hex: "#d32f2f" },
  { name: "rose", hex: "#e91e8c" },
  { name: "violet", hex: "#7b1fa2" },
  { name: "bleu", hex: "#1e5bd6" },
  { name: "vert", hex: "#2e9d3a" },
  { name: "noir", hex: "#222222" },
  { name: "blanc", hex: "#f2f2f2" },
  { name: "gris", hex: "#8a8a8a" },
];

export function routeLabel(route: Route): string {
  const base = `${route.color} ${route.grade}`;
  return route.name ? `${route.name} (${base})` : base;
}

export function routeHex(route: Route): string {
  return route.colorHex ?? ROUTE_COLORS.find((c) => c.name === route.color)?.hex ?? "#888888";
}

export function routeBlock(route: Route, rating: number, piece: Piece | null, relaxations: string[] = []): Block {
  return {
    holds: [],
    estimatedRating: Math.round(rating),
    relaxations,
    piece: piece ?? undefined,
    route: { id: route.id, label: routeLabel(route), color: route.color, colorHex: routeHex(route), grade: route.grade, styles: [...route.styles] },
  };
}

export interface RouteOptions {
  piece: Piece | null;
  targetRating: number;
  /** Cote maximale (bloc imposé : budget). */
  maxRating?: number;
  /** Cote apprise d'une voie (Glicko-2), sinon celle de sa cotation. */
  ratingOf?: (route: Route) => number | undefined;
  usage?: Map<string, number>;
  /** Restreint le choix à ces voies (voies retenues pour une partie). */
  allowed?: readonly string[];
  rng: Rng;
}

/** Voies en place, avec leur cote (apprise si connue). */
export function activeRoutes(wall: Wall, ratingOf?: (route: Route) => number | undefined): { route: Route; rating: number }[] {
  return wall.routes.filter((r) => !r.archived).map((route) => ({ route, rating: ratingOf?.(route) ?? gradeToRating(route.grade) }));
}

/** Choisit la voie la plus proche de la cote visée, en préférant le style de la pièce. */
export function pickRoute(wall: Wall, options: RouteOptions): Block | null {
  const { piece, targetRating, maxRating, usage, rng } = options;
  let candidates = activeRoutes(wall, options.ratingOf);
  if (options.allowed && options.allowed.length > 0) {
    const allowed = new Set(options.allowed);
    const kept = candidates.filter((c) => allowed.has(c.route.id));
    if (kept.length > 0) candidates = kept;
  }
  if (candidates.length === 0) return null;
  const relaxations: string[] = [];
  if (maxRating !== undefined) {
    const within = candidates.filter((c) => c.rating <= maxRating);
    if (within.length > 0) candidates = within;
    else relaxations.push("aucune voie sous le budget : la plus facile est proposée");
  }
  const wanted = piece ? PIECE_STYLES[piece] : [];
  const matches = (r: Route) => wanted.length === 0 || r.styles.some((s) => wanted.includes(s));
  const score = (c: { route: Route; rating: number }) =>
    Math.abs(c.rating - targetRating) + (matches(c.route) ? 0 : 150) + 40 * (usage?.get(c.route.id) ?? 0) + rng() * 40;
  const best = candidates.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (piece && !matches(best.route)) relaxations.push("pas de voie au style de la pièce : la plus proche en cote");
  usage?.set(best.route.id, (usage.get(best.route.id) ?? 0) + 1);
  return routeBlock(best.route, best.rating, piece, relaxations);
}

export interface RouteSessionOptions {
  /** Cote autour de laquelle se construit la séance. */
  targetRating: number;
  count: number;
  pattern?: DistributionPattern;
  /** Écart de cote entre deux crans de la répartition (pyramide, progressive…). */
  step?: number;
  ratingOf?: (route: Route) => number | undefined;
  rng: Rng;
}

/**
 * Séance de voies (Brlok classique en salle) : la répartition donne une cote par voie (ex. pyramide autour
 * de la cible), puis on prend la voie en place la plus proche, sans la reprendre deux fois si possible.
 */
export function routeSession(wall: Wall, options: RouteSessionOptions): Block[] {
  const { targetRating, count, pattern = "uniforme", step = 100, rng } = options;
  const routes = activeRoutes(wall, options.ratingOf);
  if (routes.length === 0 || count < 1) return [];
  // distributionLevels travaille en niveaux 1–6 : on la centre sur 3 et on la traduit en écarts de cote.
  const targets = distributionLevels(pattern, count, 3).map((level) => targetRating + (level - 3) * step);
  const used = new Set<string>();
  return targets.map((target) => {
    const free = routes.filter((c) => !used.has(c.route.id));
    const pool = free.length > 0 ? free : routes;
    const best = pool.reduce((a, b) => (Math.abs(b.rating - target) + rng() * 20 < Math.abs(a.rating - target) + rng() * 20 ? b : a));
    used.add(best.route.id);
    return routeBlock(best.route, best.rating, null, free.length === 0 ? ["moins de voies que de blocs : une voie revient"] : []);
  });
}

export interface RouteLog {
  attempts: number;
  successes: number;
  lastAt?: string;
  firstSuccessAt?: string;
}

/** Carnet : tentatives et réussites d'un joueur sur chaque voie d'un mur. */
export function routeLogs(
  attempts: readonly { playerId: string; wallId: string; routeId?: string; success: boolean; at: string }[],
  playerId: string,
  wallId: string,
): Map<string, RouteLog> {
  const logs = new Map<string, RouteLog>();
  // Journal du plus récent au plus ancien : on le parcourt à l'envers pour garder la première réussite.
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a.playerId !== playerId || a.wallId !== wallId || !a.routeId) continue;
    const log = logs.get(a.routeId) ?? { attempts: 0, successes: 0 };
    log.attempts++;
    if (a.success) {
      log.successes++;
      log.firstSuccessAt ??= a.at;
    }
    log.lastAt = a.at;
    logs.set(a.routeId, log);
  }
  return logs;
}
