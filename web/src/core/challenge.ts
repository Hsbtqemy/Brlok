/**
 * Point d'entrée commun pour obtenir un bloc : généré sur un pan, choisi parmi les voies d'un mur de salle.
 */
import { generateChessBlock, type Block, type ChessBlockOptions } from "./generator";
import { pickRoute } from "./gym";
import type { Route, Wall } from "./wall";

export interface ChallengeOptions extends ChessBlockOptions {
  maxRating?: number;
  routeRating?: (route: Route) => number | undefined;
  /** Mur à voies : voies retenues (toutes si absent ou vide). */
  allowedRoutes?: readonly string[];
}

export function makeChallengeBlock(wall: Wall, options: ChallengeOptions): Block | null {
  if (wall.kind === "voies") {
    return pickRoute(wall, {
      piece: options.piece,
      targetRating: options.targetRating,
      maxRating: options.maxRating,
      ratingOf: options.routeRating,
      usage: options.usage,
      allowed: options.allowedRoutes,
      rng: options.rng,
    });
  }
  return generateChessBlock(wall, options);
}
