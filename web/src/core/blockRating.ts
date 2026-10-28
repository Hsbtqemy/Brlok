/** Cote initiale estimée d'un bloc à partir des niveaux de ses prises (REGLES.md §7.3). */

export const RATING_CENTER = 1500;
export const POINTS_PER_LEVEL = 200;
/** Niveau moyen qui vaut RATING_CENTER. */
export const LEVEL_CENTER = 3.5;

export function estimateBlockRating(levels: readonly number[]): number {
  if (levels.length === 0) return RATING_CENTER;
  const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
  const max = Math.max(...levels);
  return Math.round(
    RATING_CENTER + POINTS_PER_LEVEL * (mean - LEVEL_CENTER) + 100 * (max - mean) + 25 * (levels.length - 6),
  );
}

/** Niveau de prise cible (non arrondi) correspondant à une cote visée. */
export function ratingToLevel(rating: number): number {
  return LEVEL_CENTER + (rating - RATING_CENTER) / POINTS_PER_LEVEL;
}
