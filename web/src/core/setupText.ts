/**
 * Textes du lancement de partie : ce que chaque réglage change, en phrases, à partir des vraies valeurs du
 * moteur de jeu (pénalités, verdicts, durées). Rien ici ne décide d'une règle : on les décrit.
 */
import { AUTO_FEET, type BeamSetup, DIFFICULTY, FORMAT, SERIES_SIZE, SOLO_INCREMENT_MS, VERDICT_LABELS, verdictForFall, type Density, type Difficulty, type Format, type Rhythm } from "./game";
import { FOOT_RULES, type FootRule } from "./feet";
import type { Family } from "./rounds";

export type GameFamily = "C" | "D" | Family;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { facile: "Facile", modere: "Modéré", difficile: "Difficile", diabolique: "Diabolique" };

/** Les quatre types de partie : une phrase, et le déroulé en étapes (pour le petit schéma). */
export const FAMILIES: { id: GameFamily; label: string; tagline: string; flow: string[] }[] = [
  { id: "D", label: "Intrication", tagline: "La partie déclenche la grimpe : une prise, un échec, et c'est au mur.", flow: ["♟ coup", "🧗 bloc", "♟ coup"] },
  {
    id: "C",
    label: "Intrication rythmée",
    tagline: "L'intrication, plus une cloche régulière : chacun grimpe sur sa pièce la plus active.",
    flow: ["♟ coups", "🔔 cloche", "🧗 bloc"],
  },
  { id: "A", label: "Rounds", tagline: "Comme le chessboxing : rounds d'échecs et duels au mur en alternance.", flow: ["♟ round", "🧗 duel", "♟ round"] },
  {
    id: "B",
    label: "Rounds couplés",
    tagline: "Des rounds dont le duel vient de la position ; le gagnant prend un bonus.",
    flow: ["♟ round", "🧗 duel sur la pièce active", "⏱ bonus"],
  },
];

export const isRounds = (f: GameFamily) => f === "A" || f === "B";

/** Durée d'une partie, selon le type et la cadence. */
export function cadenceText(family: GameFamily, format: Format): string {
  if (isRounds(family)) return format === "blitz" ? "rounds d'échecs de 2 min, duels de 3 min (+ 3)" : "rounds d'échecs de 4 et 3 min, duels de 5 min (+ 5)";
  return `${FORMAT[format].startMs / 60_000} min chacun`;
}

const s = (ms: number) => `${ms / 1000} s`;

/** Ce qui déclenche un bloc, selon la densité. */
export function densityText(density: Density, solo: boolean): string {
  const base =
    density === "legere"
      ? "seules les prises de pièces (et le mat) font grimper"
      : density === "normale"
        ? "un échange = un bloc, et le coup qui suit un bloc est libre"
        : "chaque prise, échec et roque fait grimper";
  if (!solo) return base;
  const defense =
    density === "legere" ? "les coups de Stockfish ne te font pas grimper" : density === "normale" ? "quand Stockfish prend une pièce, tu grimpes un bloc de défense" : "ses prises et ses échecs te font grimper un bloc de défense";
  return `${base} ; ${defense}`;
}

/** Ce que coûte une chute, selon le niveau et le passage au mur. */
export function fallText(difficulty: Difficulty, rhythm: Rhythm): string {
  const d = DIFFICULTY[difficulty];
  if (rhythm === "series") return `une chute coûte ${s(d.penaltyMs)} à ta pendule`;
  const first = VERDICT_LABELS[verdictForFall(difficulty, 1)].toLowerCase();
  const tries = d.attempts > 1 ? `${d.attempts} essais par bloc, puis ` : "";
  return `${tries}1re chute : coup ${first}, et pire si tu enchaînes les chutes`;
}

export function feetText(feet: "auto" | FootRule, difficulty: Difficulty): string {
  const rule = feet === "auto" ? AUTO_FEET[difficulty] : feet;
  return FOOT_RULES.find((r) => r.id === rule)?.label.toLowerCase() ?? "pieds libres";
}

/** Les conséquences d'un réglage d'intensité, en trois lignes courtes (cartes « Quelle intensité ? »). */
export function intensityLines(o: { difficulty: Difficulty; density: Density; rhythm: Rhythm; feet: "auto" | FootRule; solo: boolean; onRoutes: boolean }): string[] {
  return [
    capitalize(fallText(o.difficulty, o.rhythm)),
    capitalize(densityText(o.density, false)),
    ...(o.onRoutes ? [] : [capitalize(feetText(o.feet, o.difficulty))]),
  ];
}

export interface RecapInput {
  solo: boolean;
  /** Solo : couleur jouée ; « hasard » tirée au lancement. */
  color: "w" | "b" | "hasard";
  engineElo: number;
  playerNames: { solo: string; w: string; b: string };
  family: GameFamily;
  format: Format;
  duel: "ajoute" | "meme" | "impose";
  wallName: string | null;
  onRoutes: boolean;
  routesCount: number;
  variantsCount: number;
  difficulty: Difficulty;
  density: Density;
  rhythm: Rhythm;
  feet: "auto" | FootRule;
  fatigue: { w: boolean; b: boolean };
  /** La poutre (POUTRE.md §4), si la partie s'en sert. */
  beam?: BeamSetup;
}

/** La poutre dans la partie, en une phrase. */
export function beamText(beam: BeamSetup): string {
  const parts = [
    beam.mode === "seule" ? `tous les défis sont des suspensions de ${beam.seconds} s` : beam.mode === "melee" ? `les défis de la tour sont des suspensions de ${beam.seconds} s` : "",
    beam.recharge ? `la recharge se fait à la poutre${beam.mode === "aucun" ? ` (${beam.seconds} s)` : ""}` : "",
    beam.penalty ? `une pénalité de temps se rachète en tenant une suspension${beam.mode === "aucun" && !beam.recharge ? ` de ${beam.seconds} s` : ""}` : "",
  ].filter(Boolean);
  return `À la poutre : ${parts.join(" ; ")}.`;
}

const DUEL_TEXT = {
  ajoute: "chacun répète le bloc et ajoute une prise ; le premier qui tombe perd le duel",
  meme: "le même bloc pour les deux : la réussite en moins d'essais gagne",
  impose: "chacun compose le bloc de l'autre sous un budget de cote",
} as const;

/** Le récapitulatif, en phrases. */
export function recapLines(r: RecapInput): string[] {
  const lines: string[] = [];
  if (r.solo) {
    const color = r.color === "hasard" ? "une couleur tirée au hasard" : r.color === "w" ? "les Blancs" : "les Noirs";
    lines.push(`${r.playerNames.solo === "Invité" ? "Tu joues" : `${r.playerNames.solo} joue`} ${color} contre Stockfish ${r.engineElo}.`);
  } else {
    lines.push(`${r.playerNames.w} (Blancs) contre ${r.playerNames.b} (Noirs).`);
  }
  const fam = FAMILIES.find((f) => f.id === r.family)!;
  const increment = r.solo && !isRounds(r.family) ? `, + ${s(SOLO_INCREMENT_MS[r.format])} par coup joué` : "";
  lines.push(`${fam.label}, ${r.format === "blitz" ? "Blitz" : "Classique"} : ${cadenceText(r.family, r.format)}${increment}.`);
  if (r.wallName) {
    lines.push(
      r.onRoutes
        ? `Sur ${r.wallName} : ${r.routesCount} voie(s)${r.variantsCount ? `, déclinées en variantes selon la cote visée` : ", grimpées telles quelles"}.`
        : `Sur ${r.wallName}.`,
    );
  }
  if (isRounds(r.family)) {
    lines.push(`Au mur, ${DUEL_TEXT[r.duel]}.`);
    lines.push("On gagne par mat, au temps, par KO (3 duels perdus de suite) ou aux points.");
    return lines;
  }
  lines.push(`${capitalize(densityText(r.density, r.solo))}.`);
  if (r.rhythm === "series") {
    lines.push(`Tes coups passent tout de suite ; leurs blocs attendent et, à ${SERIES_SIZE}, tu vas au mur les grimper d'affilée.`);
  } else {
    lines.push("Chaque bloc se grimpe aussitôt, et son résultat décide du coup.");
  }
  lines.push(`Niveau ${DIFFICULTY_LABEL[r.difficulty]} : ${fallText(r.difficulty, r.rhythm)}${r.onRoutes ? "" : ` ; ${feetText(r.feet, r.difficulty)}`}.`);
  if (r.beam) lines.push(beamText(r.beam));
  if (r.family === "C") lines.push(`Une cloche sonne toutes les ${r.format === "blitz" ? 4 : 8} min de jeu : chacun grimpe un bloc.`);
  if (r.fatigue.w || r.fatigue.b) lines.push("Option fatigue : la cote visée baisse de 15 à chaque bloc grimpé.");
  lines.push("Le mat demande toujours un bloc réussi.");
  return lines;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
