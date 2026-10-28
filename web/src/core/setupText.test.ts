import { describe, expect, it } from "vitest";
import { intensityLines, recapLines, type RecapInput } from "./setupText";

const base: RecapInput = {
  solo: true,
  color: "w",
  engineElo: 1500,
  playerNames: { solo: "Invité", w: "Alice", b: "Bruno" },
  family: "D",
  format: "classique",
  duel: "meme",
  wallName: "Pan principal",
  onRoutes: false,
  routesCount: 0,
  variantsCount: 0,
  difficulty: "modere",
  density: "normale",
  rhythm: "series",
  feet: "auto",
  fatigue: { w: false, b: false },
};

describe("textes du lancement de partie", () => {
  it("récapitulatif en phrases, tiré des valeurs du moteur", () => {
    const lines = recapLines(base);
    expect(lines[0]).toBe("Tu joues les Blancs contre Stockfish 1500.");
    expect(lines[1]).toBe("Intrication, Classique : 10 min chacun, + 10 s par coup joué.");
    expect(lines.some((l) => l.includes("à 3, tu vas au mur"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Niveau Modéré : une chute coûte 20 s"))).toBe(true);
    expect(lines.at(-1)).toBe("Le mat demande toujours un bloc réussi.");
  });

  it("à chaque bloc : le verdict de la première chute ; en rounds, pas de niveau", () => {
    const immediat = recapLines({ ...base, solo: false, rhythm: "immediat", difficulty: "difficile" });
    expect(immediat[0]).toBe("Alice (Blancs) contre Bruno (Noirs).");
    expect(immediat.find((l) => l.startsWith("Niveau"))).toContain("1re chute : coup annulé");
    const rounds = recapLines({ ...base, family: "A", format: "blitz" });
    expect(rounds[1]).toContain("rounds d'échecs de 2 min");
    expect(rounds.some((l) => l.startsWith("Niveau"))).toBe(false);
  });

  it("cartes d'intensité : trois conséquences, sans les pieds sur un mur à voies", () => {
    expect(intensityLines({ difficulty: "facile", density: "legere", rhythm: "immediat", feet: "auto", solo: true, onRoutes: false })).toEqual([
      "2 essais par bloc, puis 1re chute : coup validé + pénalité, et pire si tu enchaînes les chutes",
      "Seules les prises de pièces (et le mat) font grimper",
      "Pieds libres",
    ]);
    expect(intensityLines({ difficulty: "diabolique", density: "intense", rhythm: "series", feet: "auto", solo: true, onRoutes: true })).toHaveLength(2);
  });
});
