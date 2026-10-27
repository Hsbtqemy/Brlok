/**
 * Joueurs, cotes (REGLES.md §8) et journal des tentatives.
 * Trois cotes par joueur ; les blocs ont aussi leur cote, partagée entre Brlok classique et Chesscalade.
 */
import type { Block } from "./generator";
import { newRating, recordAttempt, updateRating, type Rating } from "./glicko2";

export type RatingKind = "echecs" | "grimpe" | "chesscalade";

export interface Player {
  id: string;
  name: string;
  ratings: Record<RatingKind, Rating>;
}

export interface AttemptRecord {
  at: string;
  playerId: string;
  wallId: string;
  holds: string[];
  success: boolean;
  context: "libre" | "partie";
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
}

/** Incertitude de départ d'un bloc : sa cote estimée est déjà une information. */
const NEW_BLOCK_RD = 250;
const JOURNAL_LIMIT = 500;

export function emptyRatingsState(): RatingsState {
  return { players: [], blocks: {}, attempts: [], games: [] };
}

/** Identifiant unique sans dépendre de crypto.randomUUID (absent hors HTTPS, ex. tablette sur le réseau local). */
function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlayer(state: RatingsState, name: string, id = newId()): RatingsState {
  const player: Player = {
    id,
    name: name.trim() || "Joueur",
    ratings: { echecs: newRating(), grimpe: newRating(), chesscalade: newRating() },
  };
  return { ...state, players: [...state.players, player] };
}

export function removePlayer(state: RatingsState, id: string): RatingsState {
  return { ...state, players: state.players.filter((p) => p.id !== id) };
}

export function blockKey(wallId: string, holds: readonly string[]): string {
  return `${wallId}:${holds.join("-")}`;
}

export function blockRating(state: RatingsState, wallId: string, block: Block): Rating {
  const ids = block.holds.map((h) => h.id);
  return state.blocks[blockKey(wallId, ids)] ?? { rating: block.estimatedRating, rd: NEW_BLOCK_RD, volatility: 0.06 };
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
  if (!player || block.holds.length === 0) return { state, delta: 0 };
  const ids = block.holds.map((h) => h.id);
  const key = blockKey(wallId, ids);
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
