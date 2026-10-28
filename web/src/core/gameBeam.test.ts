import { describe, expect, it } from "vitest";
import type { Square } from "chess.js";
import { ChesscaladeGame, type BeamSetup, type BlockRequest, type Difficulty, type GameConfig } from "./game";

function setup(beam: BeamSetup, difficulty: Difficulty = "modere", extra: Partial<GameConfig> = {}) {
  const requests: BlockRequest[] = [];
  const config: GameConfig = {
    format: "classique",
    difficulty,
    deviation: "courte",
    density: "intense",
    players: {
      w: { name: "Alice", climbRating: 1500, fatigue: false },
      b: { name: "Bruno", climbRating: 1400, fatigue: false },
    },
    beam,
    ...extra,
  };
  const game = new ChesscaladeGame(
    config,
    (r) => {
      requests.push(r);
      return { holds: [], estimatedRating: r.targetRating, relaxations: [] };
    },
    0,
  );
  return { game, requests };
}

const play = (game: ChesscaladeGame, lan: string) => game.play(lan.slice(0, 2) as Square, lan.slice(2, 4) as Square, undefined, 0);

describe("Chesscalade à la poutre (POUTRE.md §4)", () => {
  it("poutre seule : chaque défi est une suspension de la durée choisie, sans règle de pieds", () => {
    const { game, requests } = setup({ mode: "seule", seconds: 20, recharge: false, penalty: false }, "diabolique");
    for (const lan of ["e2e4", "d7d5"]) play(game, lan);
    play(game, "e4d5");
    expect(requests.at(-1)).toMatchObject({ kind: "defi", beam: true, hangS: 20 });
    expect(requests.at(-1)?.feet).toBeUndefined();
    // Diabolique raccourcit la limite des blocs, pas au point d'empêcher de tenir la suspension.
    expect(game.pending!.timeLimitMs).toBeGreaterThanOrEqual((20 + 3 + 15) * 1000);
  });

  it("mêlée : les défis de la tour à la poutre, les autres pièces au pan", () => {
    const { game, requests } = setup({ mode: "melee", seconds: 10, recharge: false, penalty: false });
    play(game, "a2a4");
    play(game, "b7b5");
    play(game, "a4b5"); // prise de pion par un pion : au pan
    expect(requests.at(-1)).toMatchObject({ piece: "pion" });
    expect(requests.at(-1)?.beam).toBeUndefined();
    game.blockResult(true, 0);
    play(game, "a7a6");
    play(game, "a1a6"); // la tour prend : à la poutre
    expect(requests.at(-1)).toMatchObject({ piece: "tour", beam: true, hangS: 10 });
  });

  it("recharge à la poutre", () => {
    const { game, requests } = setup({ mode: "aucun", seconds: 15, recharge: true, penalty: false });
    game.requestRecharge(false, 0);
    expect(requests.at(-1)).toMatchObject({ kind: "recharge", beam: true, hangS: 15 });
    expect(game.clock.running).toBe("w");
  });

  it("sans poutre, rien ne change", () => {
    const { game, requests } = setup({ mode: "aucun", seconds: 10, recharge: false, penalty: false });
    game.requestRecharge(false, 0);
    expect(requests.at(-1)?.beam).toBeUndefined();
  });

  /** Parade ratée en Modéré : une pénalité de 20 s (REGLES.md §5.4). */
  function failParade(game: ChesscaladeGame) {
    for (const lan of ["e2e4", "e7e5", "f1c4", "a7a6"]) {
      play(game, lan);
      while (game.phase === "block") game.blockResult(true, 0);
    }
    play(game, "c4f7"); // prise + échec
    game.blockResult(true, 0);
    expect(game.pending?.request.kind).toBe("parade");
    game.blockResult(false, 0);
  }

  it("pénalité rachetée : suspension tenue, pas de temps perdu", () => {
    const { game, requests } = setup({ mode: "aucun", seconds: 10, recharge: false, penalty: true });
    const before = game.clock.remainingAt("b", 0);
    failParade(game);
    expect(game.clock.remainingAt("b", 0)).toBe(before);
    expect(game.phase).toBe("block");
    expect(game.pending).toMatchObject({ debtMs: 20_000 });
    expect(requests.at(-1)).toMatchObject({ climber: "b", kind: "penalite", beam: true, targetRating: 1400 - 100 });
    expect(game.clock.running).toBeNull();
    game.blockResult(true, 0);
    expect(game.clock.remainingAt("b", 0)).toBe(before);
    expect(game.phase).toBe("move");
    expect(game.clock.running).toBe("b");
    expect(game.log.at(-1)?.text).toContain("rachetée");
  });

  it("pénalité rachetée : suspension lâchée, la pénalité s'applique", () => {
    const { game } = setup({ mode: "aucun", seconds: 10, recharge: false, penalty: true });
    const before = game.clock.remainingAt("b", 0);
    failParade(game);
    game.blockResult(false, 0);
    expect(game.clock.remainingAt("b", 0)).toBe(before - 20_000);
    expect(game.beamDebt).toEqual({ w: 0, b: 0 });
  });

  it("Facile, verdict V1 : la pénalité attend la poutre, le coup est joué", () => {
    const { game, requests } = setup({ mode: "aucun", seconds: 10, recharge: false, penalty: true }, "facile");
    for (const lan of ["e2e4", "d7d5"]) play(game, lan);
    play(game, "e4d5");
    game.blockResult(false, 0);
    game.blockResult(false, 0); // deux essais en Facile, puis V1
    expect(game.chess.get("d5")?.color).toBe("w");
    expect(requests.at(-1)).toMatchObject({ climber: "w", kind: "penalite" });
    expect(game.pending?.debtMs).toBe(10_000);
  });

  it("la pénalité en attente survit à la sauvegarde", () => {
    const { game } = setup({ mode: "aucun", seconds: 10, recharge: false, penalty: true });
    failParade(game);
    const saved = JSON.parse(JSON.stringify(game.save(0)));
    const restored = ChesscaladeGame.restore(saved, () => ({ holds: [], estimatedRating: 1500, relaxations: [] }), 0);
    expect(restored.pending).toMatchObject({ debtMs: 20_000 });
    expect(restored.config.beam).toMatchObject({ penalty: true });
    restored.blockResult(false, 0);
    expect(restored.clock.remainingAt("b", 0)).toBe(game.clock.remainingAt("b", 0) - 20_000);
  });
});
