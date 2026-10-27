import { describe, expect, it } from "vitest";
import { ChesscaladeGame, triggersOf, verdictForFall, type BlockRequest, type Difficulty, type Format, type GameConfig } from "./game";
import { Chess, type Square } from "chess.js";

function setup(format: Format, difficulty: Difficulty, extra: Partial<GameConfig> = {}) {
  const requests: BlockRequest[] = [];
  const config: GameConfig = {
    format,
    difficulty,
    deviation: "courte",
    players: {
      w: { name: "Alice", climbRating: 1500, fatigue: false },
      b: { name: "Bruno", climbRating: 1400, fatigue: false },
    },
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

/** Joue une suite de coups sans déclencheur (ou en réussissant les blocs). */
function playLine(game: ChesscaladeGame, line: string[], now = 0) {
  for (const lan of line) {
    game.play(lan.slice(0, 2) as Square, lan.slice(2, 4) as Square, undefined, now);
    while (game.phase === "block") game.blockResult(true, now);
  }
}

describe("verdicts (§5.3)", () => {
  it("suit l'échelle de chaque niveau avec son plafond", () => {
    expect([1, 2, 3, 4].map((n) => verdictForFall("facile", n))).toEqual([1, 1, 2, 2]);
    expect([1, 2, 3, 4].map((n) => verdictForFall("modere", n))).toEqual([2, 3, 4, 4]);
    expect([1, 2, 3, 4].map((n) => verdictForFall("difficile", n))).toEqual([3, 4, 5, 5]);
    expect([1, 2, 3, 4, 5].map((n) => verdictForFall("diabolique", n))).toEqual([3, 4, 5, 6, 6]);
  });
});

describe("déclencheurs (§3.2)", () => {
  it("en Blitz, une prise de pion ne déclenche rien", () => {
    const chess = new Chess("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    const exd5 = chess.moves({ verbose: true }).find((m) => m.lan === "e4d5")!;
    expect(triggersOf("blitz", exd5)).toEqual([]);
    expect(triggersOf("classique", exd5)).toEqual(["capture"]);
  });
});

describe("partie", () => {
  it("un coup sans déclencheur passe directement et la pendule change de camp", () => {
    const { game } = setup("classique", "modere");
    game.play("e2", "e4", undefined, 1000);
    expect(game.turn).toBe("b");
    expect(game.clock.running).toBe("b");
    expect(game.clock.remaining.w).toBe(10 * 60_000 - 1000);
  });

  it("une prise met le coup en suspens, pendule en pause, crux en dernier", () => {
    const { game, requests } = setup("classique", "modere");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    expect(game.phase).toBe("block");
    expect(game.clock.running).toBeNull();
    const req = requests.at(-1)!;
    expect(req).toMatchObject({ climber: "w", kind: "defi", piece: "pion", cruxLast: true, targetRating: 1500 - 300 });
    game.blockResult(true, 5000);
    expect(game.chess.get("d5")?.type).toBe("p");
    expect(game.turn).toBe("b");
  });

  it("Modéré : 1re chute = Limité (pièce épuisée 1 tour)", () => {
    const { game } = setup("classique", "modere");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0);
    expect(game.lastVerdict?.verdict).toBe(2);
    expect(game.chess.get("d5")?.color).toBe("w");
    playLine(game, ["g8f6"]);
    // Le pion épuisé ne peut pas bouger ce tour-ci.
    expect(game.allowedMoves().some((m) => m.from === "d5")).toBe(false);
    playLine(game, ["b1c3", "a7a6"]);
    expect(game.allowedMoves().some((m) => m.from === "d5")).toBe(true);
  });

  it("Difficile : 1re chute = Annulé, il faut jouer un autre coup", () => {
    const { game } = setup("classique", "difficile");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0);
    expect(game.lastVerdict?.verdict).toBe(3);
    expect(game.turn).toBe("w");
    expect(game.allowedMoves().some((m) => m.lan === "e4d5")).toBe(false);
  });

  it("Difficile : 3e chute consécutive = Dévié vers la case légale la plus proche", () => {
    const { game } = setup("classique", "difficile");
    playLine(game, ["e2e4", "d7d5", "d1h5", "b8c6"]);
    // 1re chute : Annulé (exd5). 2e chute : Interdit (Dxf7+). 3e chute : Dévié (Dxh7).
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0);
    game.play("h5", "f7", undefined, 0);
    game.blockResult(false, 0);
    expect(game.lastVerdict?.verdict).toBe(4);
    expect(game.allowedMoves().some((m) => m.from === "h5")).toBe(false);
  });

  it("Diabolique : V6 laisse l'adversaire choisir la déviation et coûte 45 s", () => {
    const { game } = setup("classique", "diabolique");
    playLine(game, ["e2e4", "d7d5", "d2d4", "c8f5", "b1c3"]);
    game.consecutiveFalls.b = 3; // la prochaine chute donnera V6
    const before = game.clock.remainingAt("b", 0);
    game.play("f5", "e4", undefined, 0);
    game.blockResult(false, 0);
    expect(game.lastVerdict?.verdict).toBe(6);
    expect(game.phase).toBe("deviation");
    expect(game.deviation?.chooser).toBe("w");
    expect(game.deviation?.options.every((m) => m.from === "f5" && m.to !== "e4")).toBe(true);
    expect(game.clock.remainingAt("b", 0)).toBe(before - 45_000);
    const to = game.deviation!.options[0].to;
    game.chooseDeviation(to, 0);
    expect(game.chess.get(to)?.type).toBe("b");
    expect(game.turn).toBe("w");
  });

  it("bloc du mat raté : le mat est annulé (V3 minimum), même en Facile", () => {
    const { game, requests } = setup("classique", "facile");
    playLine(game, ["e2e4", "f7f6", "d2d4", "g7g5"]);
    game.play("d1", "h5", undefined, 0);
    expect(requests.at(-1)).toMatchObject({ kind: "defi", targetRating: 1500 - 200 + 200 });
    game.blockResult(false, 0);
    game.blockResult(false, 0); // 2 essais en Facile
    expect(game.lastVerdict?.verdict).toBe(3);
    expect(game.result).toBeNull();
    expect(() => game.play("d1", "h5", undefined, 0)).toThrow();
  });

  it("le mat n'est acquis qu'après le bloc du mat réussi", () => {
    const { game } = setup("classique", "modere");
    playLine(game, ["e2e4", "f7f6", "d2d4", "g7g5"]);
    game.play("d1", "h5", undefined, 0);
    expect(game.result).toBeNull();
    game.blockResult(true, 0);
    expect(game.result).toEqual({ winner: "w", reason: "mat" });
  });

  it("parade ratée en Modéré = pénalité de temps", () => {
    const { game, requests } = setup("classique", "modere");
    playLine(game, ["e2e4", "e7e5", "f1c4", "a7a6"]);
    game.play("c4", "f7", undefined, 0); // prise + échec
    game.blockResult(true, 0);
    expect(game.phase).toBe("block");
    expect(requests.at(-1)).toMatchObject({ climber: "b", kind: "parade", piece: "roi" });
    const before = game.clock.remainingAt("b", 0);
    game.blockResult(false, 0);
    expect(game.clock.remainingAt("b", 0)).toBe(before - 20_000);
  });

  it("Blitz : pas de parade", () => {
    const { game } = setup("blitz", "difficile");
    playLine(game, ["e2e4", "e7e5", "f1c4", "a7a6"]);
    game.play("c4", "f7", undefined, 0); // prise de pion + échec : aucun déclencheur en Blitz
    expect(game.phase).toBe("move");
    expect(game.turn).toBe("b");
  });

  it("recharge : la pendule tourne pendant le bloc, puis le temps est ajouté", () => {
    const { game } = setup("classique", "modere");
    game.requestRecharge(false, 0);
    expect(game.clock.running).toBe("w");
    game.blockResult(true, 50_000);
    expect(game.clock.remainingAt("w", 50_000)).toBe(10 * 60_000 - 50_000 + 60_000);
    expect(game.canRecharge()).toBe(false);
  });

  it("Facile : deux essais par bloc-défi", () => {
    const { game } = setup("classique", "facile");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0);
    expect(game.phase).toBe("block");
    game.blockResult(true, 0);
    expect(game.lastVerdict?.verdict).toBe(0);
  });

  it("drapeau : la partie est perdue au temps", () => {
    const { game } = setup("blitz", "modere");
    game.checkFlag(3 * 60_000 + 1);
    expect(game.result).toEqual({ winner: "b", reason: "temps" });
  });

  it("fatigue : la cote visée baisse de 15 par bloc grimpé", () => {
    const { game, requests } = setup("classique", "modere");
    game.setFatigue("w", true);
    game.requestRecharge(false, 0);
    game.blockResult(true, 0);
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    expect(requests.at(-1)!.targetRating).toBe(1500 - 300 - 15);
  });
});
