/**
 * Placement (REGLES.md §7.3) : 5 blocs pour fixer la cote de grimpe de départ d'un joueur.
 * La difficulté s'adapte : +200 après une réussite, −200 après une chute, en partant de 1500.
 * Les 5 résultats sont ensuite comptés ensemble (une seule période Glicko-2).
 */
import { newRating, updateRating, type Rating } from "./glicko2";

export const PLACEMENT_BLOCKS = 5;
export const PLACEMENT_START = 1500;
export const PLACEMENT_STEP = 200;
export const PLACEMENT_LENGTH = 6;

export interface PlacementResult {
  target: number;
  /** Cote du bloc grimpé (estimée, ou déjà connue). */
  blockRating: number;
  success: boolean;
}

export function nextPlacementTarget(results: readonly PlacementResult[]): number {
  const last = results.at(-1);
  if (!last) return PLACEMENT_START;
  return last.target + (last.success ? PLACEMENT_STEP : -PLACEMENT_STEP);
}

export function placementRating(results: readonly PlacementResult[]): Rating {
  return updateRating(
    newRating(),
    results.map((r) => ({ opponent: { rating: r.blockRating, rd: 150, volatility: 0.06 }, score: r.success ? 1 : 0 })),
  );
}
