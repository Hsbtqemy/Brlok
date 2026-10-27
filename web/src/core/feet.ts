/**
 * Règles de pieds (REGLES.md §7.6) : on place les mains, les pieds sont une contrainte de difficulté.
 */
import type { Rng } from "./random";

export type FootRule = "libres" | "prises" | "mains" | "sans-pied";

export const FOOT_RULES: { id: FootRule; label: string; description: string; bonus: number }[] = [
  { id: "libres", label: "Pieds libres", description: "N'importe quelle prise ou le mur.", bonus: 0 },
  { id: "prises", label: "Pieds sur prises", description: "Toute prise, mais pas le mur nu.", bonus: 50 },
  { id: "mains", label: "Pieds = mains", description: "Les pieds seulement sur les prises du bloc.", bonus: 150 },
  { id: "sans-pied", label: "Un mouvement sans pied", description: "Un passage du bloc se fait pieds décollés.", bonus: 250 },
];

export function footBonus(rule: FootRule | undefined): number {
  return FOOT_RULES.find((r) => r.id === rule)?.bonus ?? 0;
}

export function footLabel(rule: FootRule | undefined): string {
  return FOOT_RULES.find((r) => r.id === rule)?.label ?? "Pieds libres";
}

/**
 * Pour « un mouvement sans pied » : le mouvement (index de la prise d'arrivée, à partir de 1) qui se fait
 * pieds décollés. On évite le premier mouvement (départ) quand le bloc est assez long.
 */
export function pickNoFootMove(length: number, rng: Rng): number {
  if (length < 2) return 1;
  const first = length > 2 ? 2 : 1;
  return first + Math.floor(rng() * (length - first));
}
