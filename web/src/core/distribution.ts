/** Répartitions des niveaux dans un bloc — port de brlok/config/difficulty.py, étendu à 1–6. */
import { clampLevel } from "./wall";

export const DISTRIBUTION_PATTERNS = [
  { id: "uniforme", label: "Uniforme" },
  { id: "progressive", label: "Progressive" },
  { id: "pyramide", label: "Pyramide" },
  { id: "regressive", label: "Régressive" },
  { id: "crux", label: "Crux central" },
  { id: "alternance", label: "Alternance" },
] as const;

export type DistributionPattern = (typeof DISTRIBUTION_PATTERNS)[number]["id"];

/** Niveau visé pour chaque position du bloc (même formules que Brlok desktop). */
export function distributionLevels(pattern: DistributionPattern, nHolds: number, target: number): number[] {
  const n = Math.max(1, nHolds);
  const t = clampLevel(target);
  // Python round() arrondit au pair : on le reproduit pour garder les mêmes séquences que Brlok.
  const pyRound = (x: number) => {
    const f = Math.floor(x);
    const diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  };
  switch (pattern) {
    case "uniforme":
      return Array(n).fill(t);
    case "progressive":
      return Array.from({ length: n }, (_, i) => (n > 1 ? clampLevel(pyRound(t - 1 + (2 * i) / (n - 1))) : t));
    case "regressive":
      return Array.from({ length: n }, (_, i) => (n > 1 ? clampLevel(pyRound(t + 1 - (2 * i) / (n - 1))) : t));
    case "pyramide": {
      const half = Math.floor(n / 2);
      const up = Array.from({ length: half + 1 }, (_, i) => clampLevel(t - 1 + Math.floor((i * 2) / Math.max(1, half))));
      const down = half > 0 ? up.slice(0, -1).reverse() : [];
      return [...up, ...down].slice(0, n);
    }
    case "crux": {
      const base = Array(n).fill(t);
      base[Math.floor(n / 2)] = clampLevel(t + 1);
      return base;
    }
    case "alternance":
      return Array.from({ length: n }, (_, i) => clampLevel(t - 1 + (i % 2) * 2));
  }
}
