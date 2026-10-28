/**
 * Mode salle (MURS.md étape 3) : un mur à voies. Les blocs ne sont pas générés, ils sont **choisis**
 * parmi les voies en place, selon la cote visée et le caractère de la pièce.
 */
import { distributionLevels, type DistributionPattern } from "./distribution";
import type { Block } from "./generator";
import type { Piece } from "./pieces";
import type { Rng } from "./random";
import { orderedMarks, type Route, type Wall } from "./wall";

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

/**
 * Variantes d'une voie (REGLES.md §13.4) : une contrainte qui rend la même voie plus facile ou plus dure,
 * choisie selon l'écart entre la cote visée et la cote de la voie. Un cran de cotation ≈ 100 points.
 */
export type RouteVariant =
  | "pieds-libres"
  | "sans-pied"
  | "desescalade"
  | "saute-prise"
  | "deux-fois"
  | "jusqu-a"
  | "saute-numero"
  | "sans-doubler";

/** `ordre` : variante d'une voie numérotée (au moins ORDERED_MIN prises dans l'ordre) ; `libre` : d'une voie qui ne l'est pas. */
export const ROUTE_VARIANTS: { id: RouteVariant; label: string; description: string; bonus: number; for?: "ordre" | "libre" }[] = [
  { id: "pieds-libres", label: "Pieds libres", description: "Les pieds sur n'importe quelle prise ou sur le mur.", bonus: -100 },
  { id: "jusqu-a", label: "Jusqu'à une prise", description: "La voie s'arrête plus tôt : tenir la prise indiquée suffit.", bonus: -150, for: "ordre" },
  { id: "sans-pied", label: "Un mouvement sans pied", description: "Un passage au choix se fait pieds décollés.", bonus: 150 },
  { id: "desescalade", label: "Aller-retour", description: "Monte, puis redescends la voie jusqu'au départ.", bonus: 150 },
  { id: "sans-doubler", label: "Sans doubler", description: "Une seule main par prise numérotée : pas de rétablissement à deux mains.", bonus: 150, for: "ordre" },
  { id: "saute-prise", label: "Saute une prise", description: "Une prise de main au choix est interdite.", bonus: 200, for: "libre" },
  { id: "saute-numero", label: "Sans une prise", description: "La prise indiquée est interdite : il faut la sauter.", bonus: 200, for: "ordre" },
  { id: "deux-fois", label: "Deux fois", description: "Enchaîne la voie deux fois, sans poser les pieds au sol entre les deux.", bonus: 250 },
];

/** Nombre de prises numérotées à partir duquel une voie a les variantes liées à l'ordre. */
export const ORDERED_MIN = 4;

export function routeVariantInfo(variant: RouteVariant | undefined) {
  return ROUTE_VARIANTS.find((v) => v.id === variant);
}

/** Variantes applicables à une voie : celles « ordre » demandent une voie numérotée, « libre » l'inverse. */
export function variantFits(route: Route, variant: (typeof ROUTE_VARIANTS)[number]): boolean {
  const ordered = orderedMarks(route.marks).length >= ORDERED_MIN;
  return !variant.for || (variant.for === "ordre") === ordered;
}

/**
 * Prise visée par une variante liée à l'ordre : la fin de la voie raccourcie (aux 3/5 environ), ou une prise
 * à sauter, ni la première ni la dernière.
 */
export function variantHold(route: Route, variant: RouteVariant, rng: Rng): number | undefined {
  const n = orderedMarks(route.marks).length;
  if (variant === "jusqu-a") return Math.max(2, Math.ceil(n * 0.6));
  if (variant === "saute-numero") return 2 + Math.floor(rng() * Math.max(1, n - 2));
  return undefined;
}

/** Libellé d'une variante, avec sa prise s'il y en a une (« Jusqu'à la prise n° 4 »). */
export function variantText(variant: RouteVariant | undefined, hold?: number): { label: string; description: string } | undefined {
  const info = routeVariantInfo(variant);
  if (!info) return undefined;
  if (variant === "jusqu-a" && hold) return { label: `Jusqu'à la prise n° ${hold}`, description: `Tenir la prise n° ${hold} des deux mains suffit.` };
  if (variant === "saute-numero" && hold) return { label: `Sans la prise n° ${hold}`, description: `La prise n° ${hold} est interdite : il faut la sauter.` };
  return { label: info.label, description: info.description };
}

export function routeBlock(
  route: Route,
  rating: number,
  piece: Piece | null,
  relaxations: string[] = [],
  variant?: RouteVariant,
  variantHoldN?: number,
): Block {
  return {
    holds: [],
    estimatedRating: Math.round(rating),
    relaxations,
    piece: piece ?? undefined,
    route: {
      id: route.id,
      label: routeLabel(route),
      color: route.color,
      colorHex: routeHex(route),
      grade: route.grade,
      styles: [...route.styles],
      ...(variant ? { variant } : {}),
      ...(variantHoldN ? { variantHold: variantHoldN } : {}),
    },
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
  /** Variantes permises (aucune si absent) : la voie telle quelle reste toujours possible. */
  variants?: readonly RouteVariant[];
  /** Cote apprise d'une voie jouée avec une variante, sinon cote de la voie + bonus de la variante. */
  variantRatingOf?: (route: Route, variant: RouteVariant) => number | undefined;
  rng: Rng;
}

/** Voies en place, avec leur cote (apprise si connue). */
export function activeRoutes(wall: Wall, ratingOf?: (route: Route) => number | undefined): { route: Route; rating: number }[] {
  return wall.routes.filter((r) => !r.archived).map((route) => ({ route, rating: ratingOf?.(route) ?? gradeToRating(route.grade) }));
}

/** Une voie telle quelle, ou avec une variante permise qui lui va, et la cote de chaque paire. */
function routeVariantPairs(
  candidates: { route: Route; rating: number }[],
  allowed: readonly RouteVariant[] | undefined,
  variantRatingOf: ((route: Route, variant: RouteVariant) => number | undefined) | undefined,
): { route: Route; rating: number; variant?: RouteVariant }[] {
  const variants = ROUTE_VARIANTS.filter((v) => allowed?.includes(v.id));
  return candidates.flatMap((c) => [
    { ...c, variant: undefined as RouteVariant | undefined },
    ...variants
      .filter((v) => variantFits(c.route, v))
      .map((v) => ({ ...c, variant: v.id, rating: variantRatingOf?.(c.route, v.id) ?? c.rating + v.bonus })),
  ]);
}

/** Pénalité d'une variante : la voie telle quelle est préférée quand l'écart est faible. */
const VARIANT_COST = 60;

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
  const wanted = piece ? PIECE_STYLES[piece] : [];
  const matches = (r: Route) => wanted.length === 0 || r.styles.some((s) => wanted.includes(s));
  // Chaque voie, telle quelle ou avec une variante permise ; une variante n'est retenue que si elle rapproche
  // nettement de la cote visée (VARIANT_COST), et l'usage fait tourner les variantes d'une même voie.
  const pairs = routeVariantPairs(candidates, options.variants, options.variantRatingOf);
  let pool = pairs;
  if (maxRating !== undefined) {
    const within = pairs.filter((c) => c.rating <= maxRating);
    if (within.length > 0) pool = within;
    else relaxations.push("aucune voie sous le budget : la plus facile est proposée");
  }
  const usageKey = (c: { route: Route; variant?: RouteVariant }) => (c.variant ? `${c.route.id}~${c.variant}` : c.route.id);
  const score = (c: (typeof pairs)[number]) =>
    Math.abs(c.rating - targetRating) +
    (matches(c.route) ? 0 : 150) +
    (c.variant ? VARIANT_COST : 0) +
    40 * (usage?.get(c.route.id) ?? 0) +
    30 * (usage?.get(usageKey(c)) ?? 0) +
    rng() * 40;
  const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (piece && !matches(best.route)) relaxations.push("pas de voie au style de la pièce : la plus proche en cote");
  usage?.set(best.route.id, (usage.get(best.route.id) ?? 0) + 1);
  if (best.variant) usage?.set(usageKey(best), (usage.get(usageKey(best)) ?? 0) + 1);
  return routeBlock(best.route, best.rating, piece, relaxations, best.variant, best.variant ? variantHold(best.route, best.variant, rng) : undefined);
}

export interface RouteSessionOptions {
  /** Cote autour de laquelle se construit la séance. */
  targetRating: number;
  count: number;
  pattern?: DistributionPattern;
  /** Écart de cote entre deux crans de la répartition (pyramide, progressive…). */
  step?: number;
  ratingOf?: (route: Route) => number | undefined;
  /** Variantes permises : une même voie peut revenir sous une autre variante (salle avec peu de voies). */
  variants?: readonly RouteVariant[];
  variantRatingOf?: (route: Route, variant: RouteVariant) => number | undefined;
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
  const pairs = routeVariantPairs(routes, options.variants, options.variantRatingOf);
  const key = (c: { route: Route; variant?: RouteVariant }) => (c.variant ? `${c.route.id}~${c.variant}` : c.route.id);
  const usedRoutes = new Set<string>();
  const usedPairs = new Set<string>();
  return targets.map((target) => {
    // D'abord une voie pas encore grimpée ; sinon la même voie sous une autre variante ; sinon une répétition.
    const fresh = pairs.filter((c) => !usedRoutes.has(c.route.id));
    const otherVariant = pairs.filter((c) => !usedPairs.has(key(c)));
    const pool = fresh.length > 0 ? fresh : otherVariant.length > 0 ? otherVariant : pairs;
    const cost = (c: (typeof pairs)[number]) => Math.abs(c.rating - target) + (c.variant ? VARIANT_COST : 0) + rng() * 20;
    const best = pool.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    usedRoutes.add(best.route.id);
    usedPairs.add(key(best));
    return routeBlock(
      best.route,
      best.rating,
      null,
      pool === pairs ? ["moins de voies que de blocs : une voie revient"] : [],
      best.variant,
      best.variant ? variantHold(best.route, best.variant, rng) : undefined,
    );
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
  attempts: readonly { playerId: string; wallId: string; routeId?: string; routeVariant?: string; success: boolean; at: string }[],
  playerId: string,
  wallId: string,
): Map<string, RouteLog> {
  const logs = new Map<string, RouteLog>();
  // Journal du plus récent au plus ancien : on le parcourt à l'envers pour garder la première réussite.
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a.playerId !== playerId || a.wallId !== wallId || !a.routeId || a.routeVariant) continue;
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
