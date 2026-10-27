/**
 * Joueurs, cotes (REGLES.md §8) et journal des tentatives.
 * Trois cotes par joueur ; les blocs ont aussi leur cote, partagée entre Brlok classique et Chesscalade.
 */
import { routeVariantInfo } from "./gym";
import type { Block } from "./generator";
import { newRating, recordAttempt, updateRating, type Rating } from "./glicko2";
import { placementRating, type PlacementResult } from "./placement";

export type RatingKind = "echecs" | "grimpe" | "chesscalade";

export interface Player {
  id: string;
  name: string;
  ratings: Record<RatingKind, Rating>;
  /** Date de création (ordre d'affichage). */
  createdAt?: string;
  /** Date du placement (cote de grimpe de départ fixée). */
  placedAt?: string;
}

export interface AttemptRecord {
  at: string;
  playerId: string;
  wallId: string;
  holds: string[];
  success: boolean;
  context: "libre" | "partie" | "placement";
  /** Règle de pieds du bloc (absente : pieds libres). */
  feet?: string;
  /** Mur à voies : la voie tentée (pour le carnet). */
  routeId?: string;
  /** Voie jouée avec une variante (§13.4) : ne compte pas au carnet de la voie. */
  routeVariant?: string;
  ratingBefore: number;
  ratingAfter: number;
  blockRating: number;
}

export interface GameRecord {
  at: string;
  white: string;
  black: string;
  /** 1 = Blancs gagnent, 0 = Noirs gagnent, 0.5 = nulle. */
  score: number;
  reason: string;
}

export interface RatingsState {
  players: Player[];
  /** Cote de chaque bloc, par clé `pan:prise-prise-…`. */
  blocks: Record<string, Rating>;
  attempts: AttemptRecord[];
  games: GameRecord[];
  /** Meilleurs temps au chrono, par joueur et par bloc (clé `joueur|bloc`). */
  bestTimes: Record<string, BestTime>;
}

export interface BestTime {
  ms: number;
  at: string;
}

/** Incertitude de départ d'un bloc : sa cote estimée est déjà une information. */
const NEW_BLOCK_RD = 250;
const JOURNAL_LIMIT = 500;

export function emptyRatingsState(): RatingsState {
  return { players: [], blocks: {}, attempts: [], games: [], bestTimes: {} };
}

/** Identifiant unique sans dépendre de crypto.randomUUID (absent hors HTTPS, ex. tablette sur le réseau local). */
function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlayer(state: RatingsState, name: string, id = newId()): RatingsState {
  const player: Player = {
    id,
    name: name.trim() || "Joueur",
    createdAt: new Date().toISOString(),
    ratings: { echecs: newRating(), grimpe: newRating(), chesscalade: newRating() },
  };
  return { ...state, players: [...state.players, player] };
}

export function removePlayer(state: RatingsState, id: string): RatingsState {
  return { ...state, players: state.players.filter((p) => p.id !== id) };
}

/** Clé d'un bloc : pan, prises, et règle de pieds (le même enchaînement pieds = mains est un autre bloc). */
export function blockKey(wallId: string, holds: readonly string[], feet?: string, noFootMove?: number): string {
  const suffix = feet && feet !== "libres" ? `~${feet}${feet === "sans-pied" && noFootMove ? noFootMove : ""}` : "";
  return `${wallId}:${holds.join("-")}${suffix}`;
}

/** Clé d'une voie de salle ; jouée avec une variante (§13.4), elle a une cote à part. */
export function routeKey(wallId: string, routeId: string, variant?: string): string {
  return `${wallId}:voie:${routeId}${variant ? `~${variant}` : ""}`;
}

const keyOf = (wallId: string, block: Block) =>
  block.route
    ? routeKey(wallId, block.route.id, block.route.variant)
    : blockKey(
        wallId,
        block.holds.map((h) => h.id),
        block.feet,
        block.noFootMove,
      );

/** Prises (ou voie) d'un bloc, pour le journal. */
const labelOf = (block: Block) =>
  block.route ? [block.route.variant ? `${block.route.label} · ${routeVariantInfo(block.route.variant)?.label}` : block.route.label] : block.holds.map((h) => h.id);

export function blockRating(state: RatingsState, wallId: string, block: Block): Rating {
  return state.blocks[keyOf(wallId, block)] ?? { rating: block.estimatedRating, rd: NEW_BLOCK_RD, volatility: 0.06 };
}

/** Une tentative de bloc = un match joueur contre bloc : les deux cotes bougent. */
export function recordBlockAttempt(
  state: RatingsState,
  playerId: string,
  wallId: string,
  block: Block,
  success: boolean,
  context: AttemptRecord["context"],
  at = new Date().toISOString(),
): { state: RatingsState; delta: number } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || (block.holds.length === 0 && !block.route)) return { state, delta: 0 };
  const ids = labelOf(block);
  const key = keyOf(wallId, block);
  const before = player.ratings.grimpe;
  const blockBefore = blockRating(state, wallId, block);
  const updated = recordAttempt(before, blockBefore, success);

  const record: AttemptRecord = {
    at,
    playerId,
    wallId,
    holds: ids,
    success,
    context,
    ...(block.feet ? { feet: block.feet } : {}),
    ...(block.route ? { routeId: block.route.id } : {}),
    ...(block.route?.variant ? { routeVariant: block.route.variant } : {}),
    ratingBefore: Math.round(before.rating),
    ratingAfter: Math.round(updated.climber.rating),
    blockRating: Math.round(blockBefore.rating),
  };
  return {
    state: {
      ...state,
      players: state.players.map((p) => (p.id === playerId ? { ...p, ratings: { ...p.ratings, grimpe: updated.climber } } : p)),
      blocks: { ...state.blocks, [key]: updated.block },
      attempts: [record, ...state.attempts].slice(0, JOURNAL_LIMIT),
    },
    delta: updated.climber.rating - before.rating,
  };
}

/**
 * Placement terminé : la cote de grimpe du joueur est remplacée par l'estimation des 5 blocs,
 * puis chaque bloc est mis à jour face à cette cote, et les tentatives vont au journal.
 */
export function recordPlacement(
  state: RatingsState,
  playerId: string,
  wallId: string,
  attempts: readonly { block: Block; result: PlacementResult }[],
  at = new Date().toISOString(),
): RatingsState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || attempts.length === 0) return state;
  const before = Math.round(player.ratings.grimpe.rating);
  const rating = placementRating(attempts.map((a) => a.result));
  const blocks = { ...state.blocks };
  const records: AttemptRecord[] = [];
  for (const { block, result } of attempts) {
    const ids = labelOf(block);
    if (ids.length === 0) continue;
    const key = keyOf(wallId, block);
    const current = blocks[key] ?? { rating: block.estimatedRating, rd: NEW_BLOCK_RD, volatility: 0.06 };
    blocks[key] = updateRating(current, [{ opponent: rating, score: result.success ? 0 : 1 }]);
    records.push({
      at,
      playerId,
      wallId,
      holds: ids,
      success: result.success,
      context: "placement",
      ...(block.route ? { routeId: block.route.id } : {}),
      ratingBefore: before,
      ratingAfter: Math.round(rating.rating),
      blockRating: Math.round(current.rating),
    });
  }
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, placedAt: at, ratings: { ...p.ratings, grimpe: rating } } : p)),
    blocks,
    attempts: [...records.reverse(), ...state.attempts].slice(0, JOURNAL_LIMIT),
  };
}

/** Identifiant de l'adversaire « moteur » dans le journal des parties. */
export function engineId(elo: number): string {
  return `stockfish-${Math.round(elo)}`;
}

/** Partie en solo contre le moteur : la cote Chesscalade du joueur bouge face à la force du moteur. */
export function recordGameVsEngine(
  state: RatingsState,
  playerId: string,
  playerColor: "w" | "b",
  engineElo: number,
  playerScore: number,
  reason: string,
  at = new Date().toISOString(),
): RatingsState {
  const engine = engineId(engineElo);
  const record: GameRecord = {
    at,
    white: playerColor === "w" ? playerId : engine,
    black: playerColor === "w" ? engine : playerId,
    score: playerColor === "w" ? playerScore : 1 - playerScore,
    reason,
  };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ...state, games: [record, ...state.games] };
  const updated = updateRating(player.ratings.chesscalade, [{ opponent: { rating: engineElo, rd: 60, volatility: 0.06 }, score: playerScore }]);
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ratings: { ...p.ratings, chesscalade: updated } } : p)),
    games: [record, ...state.games],
  };
}

export function bestTimeKey(playerId: string, wallId: string, block: Block): string {
  return `${playerId}|${keyOf(wallId, block)}`;
}

/** Enregistre un temps au chrono ; renvoie aussi l'ancien record et si celui-ci est battu. */
export function recordTime(
  state: RatingsState,
  playerId: string,
  wallId: string,
  block: Block,
  ms: number,
  at = new Date().toISOString(),
): { state: RatingsState; previous: BestTime | null; isBest: boolean } {
  const key = bestTimeKey(playerId, wallId, block);
  const previous = state.bestTimes?.[key] ?? null;
  const isBest = !previous || ms < previous.ms;
  if (!isBest) return { state, previous, isBest };
  return { state: { ...state, bestTimes: { ...(state.bestTimes ?? {}), [key]: { ms: Math.round(ms), at } } }, previous, isBest };
}

/** Résultat d'une partie entre deux joueurs, pour la cote donnée. */
export function recordGame(
  state: RatingsState,
  whiteId: string,
  blackId: string,
  score: number,
  reason: string,
  kind: RatingKind = "chesscalade",
  at = new Date().toISOString(),
): RatingsState {
  const white = state.players.find((p) => p.id === whiteId);
  const black = state.players.find((p) => p.id === blackId);
  const record: GameRecord = { at, white: whiteId, black: blackId, score, reason };
  if (!white || !black || white.id === black.id) return { ...state, games: [record, ...state.games] };
  const newWhite = updateRating(white.ratings[kind], [{ opponent: black.ratings[kind], score }]);
  const newBlack = updateRating(black.ratings[kind], [{ opponent: white.ratings[kind], score: 1 - score }]);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === whiteId
        ? { ...p, ratings: { ...p.ratings, [kind]: newWhite } }
        : p.id === blackId
          ? { ...p, ratings: { ...p.ratings, [kind]: newBlack } }
          : p,
    ),
    games: [record, ...state.games],
  };
}
