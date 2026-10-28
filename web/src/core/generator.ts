/**
 * Génération de blocs.
 * - generateClassicSession : port du générateur de Brlok desktop (brlok/generator/session_generator.py).
 * - generateChessBlock : blocs-défis Chesscalade (REGLES.md §7.4) — chemin dans le graphe de portée,
 *   forme donnée par la pièce, cote estimée la plus proche de la cote visée.
 */
import type { RouteVariant } from "./gym";
import { estimateBlockRating, ratingToLevel } from "./blockRating";
import { distributionLevels, type DistributionPattern } from "./distribution";
import { footBonus, pickNoFootMove, type FootRule } from "./feet";
import { PIECE_MAX_LENGTH, PIECE_MIN_LENGTH, pathFits, stepAllowed, type Piece } from "./pieces";
import { shuffle, weightedPick, type Rng } from "./random";
import { clampLevel, MAX_LEVEL, reachGraph, type Hold, type Wall } from "./wall";

export interface Block {
  holds: Hold[];
  piece?: Piece;
  estimatedRating: number;
  /** Assouplissements appliqués quand aucun bloc ne respectait toutes les contraintes. */
  relaxations: string[];
  /** Règle de pieds (absente : pieds libres). Sa difficulté est comprise dans `estimatedRating`. */
  feet?: FootRule;
  /** « Un mouvement sans pied » : index (à partir de 1) de la prise atteinte pieds décollés. */
  noFootMove?: number;
  /** Mur à voies : la voie choisie (le bloc n'a alors pas de prises détaillées). */
  route?: { id: string; label: string; color: string; colorHex?: string; grade: string; styles: string[]; variant?: RouteVariant; variantHold?: number };
}

export interface ClassicOptions {
  targetLevel: number;
  tolerance?: number;
  blocksCount?: number;
  holdsPerBlock?: number;
  pattern?: DistributionPattern;
  variety?: boolean;
  /** Types de prises à inclure : chaque prise en porte au moins un (vide : aucun filtre). */
  requiredTags?: readonly string[];
  /** Types de prises exclus : aucune prise n'en porte. */
  excludedTags?: readonly string[];
  /** Niveau visé bloc par bloc (modèles de Brlok desktop) ; à défaut, `targetLevel` pour tous. */
  blockLevels?: readonly number[];
  rng: Rng;
}

export function generateClassicSession(wall: Wall, options: ClassicOptions): Block[] {
  const { targetLevel, tolerance = 1, blocksCount = 5, holdsPerBlock = 10, pattern = "uniforme", variety = false, rng } = options;
  const required = options.requiredTags ?? [];
  const excluded = options.excludedTags ?? [];
  // Un type à la fois exigé et exclu : contraintes incohérentes, pas de séance (comme Brlok desktop).
  if (required.some((t) => excluded.includes(t))) return [];
  const targets = Array.from({ length: blocksCount }, (_, b) => options.blockLevels?.[b] ?? targetLevel);
  const min = Math.min(...targets.map((t) => clampLevel(t - tolerance)));
  const max = Math.max(...targets.map((t) => clampLevel(t + tolerance)));
  const eligible = wall.holds.filter(
    (h) =>
      h.active &&
      h.level >= min &&
      h.level <= max &&
      (required.length === 0 || h.tags.some((t) => required.includes(t))) &&
      !h.tags.some((t) => excluded.includes(t)),
  );
  if (eligible.length === 0) return [];

  const usage = new Map<string, number>(eligible.map((h) => [h.id, 0]));
  const blocks: Block[] = [];
  for (let b = 0; b < blocksCount; b++) {
    const target = targets[b];
    const inRange = eligible.filter((h) => Math.abs(h.level - target) <= tolerance);
    const pool = inRange.length > 0 ? inRange : eligible;
    const n = Math.min(holdsPerBlock, pool.length);
    const levels = distributionLevels(pattern, n, target);
    const chosen: Hold[] = [];
    for (let pos = 0; pos < n; pos++) {
      const req = levels[pos];
      const free = pool.filter((h) => !chosen.includes(h));
      const atLevel = free.filter((h) => Math.abs(h.level - req) <= 1);
      const candidates = atLevel.length > 0 ? atLevel : free;
      if (candidates.length === 0) break;
      const weights = candidates.map((h) => (variety ? 1 / (1 + (usage.get(h.id) ?? 0)) : 1));
      const hold = weightedPick(rng, candidates, weights);
      chosen.push(hold);
      usage.set(hold.id, (usage.get(hold.id) ?? 0) + 1);
    }
    blocks.push({ holds: chosen, estimatedRating: estimateBlockRating(chosen.map((h) => h.level)), relaxations: [] });
  }
  return blocks;
}

export interface ChessBlockOptions {
  piece: Piece | null;
  targetRating: number;
  length: number;
  pattern?: DistributionPattern;
  /** Pour une prise : la dernière prise (la pièce capturée) est le crux. */
  cruxLast?: boolean;
  tolerance?: number;
  /** Compteur d'utilisation des prises, pour varier les blocs (mis à jour par l'appelant). */
  usage?: Map<string, number>;
  /** Règle de pieds : les prises visent une cote plus basse, la règle apporte le reste. */
  feet?: FootRule;
  rng: Rng;
}

const MIN_LENGTH = 3;
const MAX_CANDIDATES = 40;
const NODE_BUDGET = 20000;

interface Attempt {
  piece: Piece | null;
  length: number;
  tolerance: number;
}

/** Génère un bloc-défi, en assouplissant les contraintes dans l'ordre de REGLES.md §7.4 si besoin. */
export function generateChessBlock(wall: Wall, options: ChessBlockOptions): Block | null {
  const feet = options.feet && options.feet !== "libres" ? options.feet : undefined;
  if (!feet) return generateHandsBlock(wall, options);
  const bonus = footBonus(feet);
  const block = generateHandsBlock(wall, { ...options, targetRating: options.targetRating - bonus });
  if (!block) return null;
  return {
    ...block,
    feet,
    noFootMove: feet === "sans-pied" ? pickNoFootMove(block.holds.length - 1, options.rng) : undefined,
    estimatedRating: block.estimatedRating + bonus,
  };
}

/** Bloc de mains seules (pieds libres). */
function generateHandsBlock(wall: Wall, options: ChessBlockOptions): Block | null {
  const { piece, tolerance = 1 } = options;
  let length = options.length;
  if (piece) {
    length = Math.min(length, PIECE_MAX_LENGTH[piece] ?? length);
    length = Math.max(length, PIECE_MIN_LENGTH[piece] ?? length);
  }
  length = Math.max(MIN_LENGTH, length);

  const ladder: { attempt: Attempt; relaxations: string[] }[] = [
    { attempt: { piece, length, tolerance }, relaxations: [] },
    { attempt: { piece, length, tolerance: tolerance + 1 }, relaxations: ["tolérance de niveau élargie"] },
  ];
  for (let l = length - 1; l >= MIN_LENGTH; l--) {
    ladder.push({ attempt: { piece, length: l, tolerance: tolerance + 1 }, relaxations: ["tolérance de niveau élargie", `bloc raccourci à ${l} prises`] });
  }
  if (piece) {
    ladder.push({
      attempt: { piece: null, length, tolerance: tolerance + 1 },
      relaxations: ["tolérance de niveau élargie", "forme de la pièce relâchée"],
    });
  }
  // Dernier recours : le mur n'a pas assez de prises proches du niveau visé.
  for (let l = length; l >= MIN_LENGTH; l--) {
    ladder.push({
      attempt: { piece: null, length: l, tolerance: MAX_LEVEL },
      relaxations: ["niveau visé ignoré", "forme de la pièce relâchée", ...(l < length ? [`bloc raccourci à ${l} prises`] : [])],
    });
  }

  for (const { attempt, relaxations } of ladder) {
    const block = searchBlock(wall, options, attempt);
    if (block) return { ...block, piece: piece ?? undefined, relaxations };
  }
  return null;
}

function searchBlock(wall: Wall, options: ChessBlockOptions, attempt: Attempt): Omit<Block, "relaxations"> | null {
  const { targetRating, pattern = "uniforme", cruxLast = false, usage, rng } = options;
  const { piece, length, tolerance } = attempt;
  const targetLevel = clampLevel(ratingToLevel(targetRating));
  const min = clampLevel(targetLevel - tolerance);
  const max = clampLevel(targetLevel + tolerance);
  const graph = reachGraph(wall);
  const eligible = new Set(wall.holds.filter((h) => h.active && h.level >= min && h.level <= max).map((h) => h.id));
  if (eligible.size < length) return null;

  const levels = distributionLevels(pattern, length, targetLevel);
  if (cruxLast) levels[length - 1] = clampLevel(Math.max(...levels) + 1);

  const candidates: Hold[][] = [];
  let nodes = 0;
  const path: Hold[] = [];

  const order = (holds: Hold[], req: number) =>
    shuffle(rng, holds).sort((a, b) => Math.abs(a.level - req) - Math.abs(b.level - req));

  const fits = (p: Hold[]) => {
    if (piece && !pathFits(wall, piece, p)) return false;
    if (cruxLast) {
      const last = p[p.length - 1].level;
      if (p.slice(0, -1).some((h) => h.level > last)) return false;
    }
    return true;
  };

  const dfs = (): boolean => {
    if (++nodes > NODE_BUDGET) return true;
    if (path.length === length) {
      if (fits(path)) candidates.push([...path]);
      return candidates.length >= MAX_CANDIDATES;
    }
    const prev = path[path.length - 1];
    const next = (prev ? graph.get(prev.id) ?? [] : wall.holds).filter((h) => eligible.has(h.id) && !path.includes(h));
    for (const h of order(next, levels[path.length])) {
      path.push(h);
      if (!piece || stepAllowed(wall, piece, path)) {
        if (dfs()) return true;
      }
      path.pop();
    }
    return false;
  };
  dfs();

  if (candidates.length === 0) return null;
  const score = (p: Hold[]) => {
    const ratingGap = Math.abs(estimateBlockRating(p.map((h) => h.level)) - targetRating);
    const used = usage ? p.reduce((s, h) => s + (usage.get(h.id) ?? 0), 0) : 0;
    return ratingGap + 15 * used + rng() * 30;
  };
  const best = candidates.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (usage) for (const h of best) usage.set(h.id, (usage.get(h.id) ?? 0) + 1);
  return { holds: best, estimatedRating: estimateBlockRating(best.map((h) => h.level)) };
}
