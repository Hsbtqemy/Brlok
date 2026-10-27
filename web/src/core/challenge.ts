/**
 * Point d'entrée commun pour obtenir un bloc : généré sur un pan, choisi parmi les voies d'un mur de salle.
 */
import { generateChessBlock, type Block, type ChessBlockOptions } from "./generator";
import { pickRoute, type RouteVariant } from "./gym";
import type { Route, Wall } from "./wall";

export interface ChallengeOptions extends ChessBlockOptions {
  maxRating?: number;
  routeRating?: (route: Route) => number | undefined;
  /** Mur à voies : voies retenues (toutes si absent ou vide). */
  allowedRoutes?: readonly string[];
  /** Mur à voies : variantes permises (§13.4) et leur cote apprise. */
  routeVariants?: readonly RouteVariant[];
  variantRating?: (route: Route, variant: RouteVariant) => number | undefined;
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
      variants: options.routeVariants,
      variantRatingOf: options.variantRating,
      rng: options.rng,
    });
  }
  return generateChessBlock(wall, options);
}
