/**
 * Réglage de la force du moteur (REGLES.md §9.1).
 * Stockfish limite sa force de 1320 à 3190 (UCI_Elo). En dessous, on joue au niveau le plus faible
 * et on remplace une partie des coups par un coup légal au hasard : approximation assumée.
 */
import type { Rng } from "./random";

export const ENGINE_MIN_UCI_ELO = 1320;
export const ENGINE_MAX_ELO = 3190;
export const ENGINE_MIN_ELO = 400;

export interface EngineSettings {
  elo: number;
  limitStrength: boolean;
  uciElo: number;
  skill: number;
  /** Probabilité de jouer un coup légal au hasard au lieu du coup du moteur. */
  randomMoveChance: number;
  movetimeMs: number;
}

export function engineSettings(elo: number): EngineSettings {
  const e = Math.round(Math.min(ENGINE_MAX_ELO, Math.max(ENGINE_MIN_ELO, elo)));
  if (e >= ENGINE_MIN_UCI_ELO) {
    return { elo: e, limitStrength: true, uciElo: e, skill: 20, randomMoveChance: 0, movetimeMs: 700 };
  }
  return {
    elo: e,
    limitStrength: false,
    uciElo: ENGINE_MIN_UCI_ELO,
    skill: 0,
    randomMoveChance: Math.min(0.8, (ENGINE_MIN_UCI_ELO - e) / 1300),
    movetimeMs: 300,
  };
}

/** Coup final : celui du moteur, ou un coup au hasard pour les forces sous 1320. */
export function pickEngineMove(best: string, candidates: readonly string[], settings: EngineSettings, rng: Rng): string {
  if (candidates.length > 0 && rng() < settings.randomMoveChance) {
    return candidates[Math.floor(rng() * candidates.length)];
  }
  return best;
}

/** Commandes UCI pour chercher un coup dans une position (`searchmoves` limite les coups permis). */
export function uciCommands(fen: string, settings: EngineSettings, searchmoves?: readonly string[]): string[] {
  return [
    `setoption name Skill Level value ${settings.skill}`,
    `setoption name UCI_LimitStrength value ${settings.limitStrength}`,
    `setoption name UCI_Elo value ${settings.uciElo}`,
    `position fen ${fen}`,
    `go movetime ${settings.movetimeMs}${searchmoves && searchmoves.length > 0 ? ` searchmoves ${searchmoves.join(" ")}` : ""}`,
  ];
}
