import { describe, expect, it } from "vitest";
import type { DuelBlockRequest, RoundsConfig } from "./rounds";
import { compareMeme, mostActivePiece, RoundsGame, ROUNDS } from "./rounds";
import type { Square } from "chess.js";

function setup(extra: Partial<RoundsConfig> = {}) {
  const requests: DuelBlockRequest[] = [];
  const config: RoundsConfig = {
    family: "A",
    format: "blitz",
    duel: "meme",
    players: { w: { name: "Alice", climbRating: 1500 }, b: { name: "Bruno", climbRating: 1300 } },
    ...extra,
  };
  const ids = ["A1", "B2", "C3", "D4", "E5", "F6", "A7"];
  const game = new RoundsGame(
    config,
    (r) => {
      requests.push(r);
      const holds = ids.slice(0, r.length).map((id, i) => ({ id, level: 3, tags: [], position: { row: i, col: i % 6 }, active: true }));
      return { holds, estimatedRating: r.targetRating, relaxations: [], piece: r.piece ?? undefined };
    },
    0,
  );
  return { game, requests };
}

const CHESS = ROUNDS.blitz.chessMs;

describe("rounds (§3.3)", () => {
  it("un round d'échecs se termine au temps : plateau figé, pendules arrêtées, duel au mur", () => {
    const { game, requests } = setup();
    game.play("e2" as Square, "e4" as Square, undefined, 1000);
    game.tick(CHESS);
    expect(game.stage).toBe("mur");
    expect(game.clock.running).toBeNull();
    expect(requests[0]).toMatchObject({ targetRating: 1400, length: ROUNDS.blitz.blockLength });
    expect(() => game.play("e7" as Square, "e5" as Square, undefined, CHESS)).toThrow();
  });

  it("« Même bloc » : la réussite en moins d'essais gagne, puis round d'échecs suivant", () => {
    const { game } = setup();
    game.tick(CHESS);
    game.memeResult("w", { success: true, attempts: 2, highest: 7 }, CHESS + 1);
    game.memeResult("b", { success: true, attempts: 1, highest: 7 }, CHESS + 2);
    expect(game.duels).toEqual([{ round: 0, winner: "b" }]);
    expect(game.stage).toBe("echecs");
    expect(game.round).toBe(1);
    expect(game.clock.running).toBe("w");
  });

  it("victoire par KO : 3 duels perdus de suite", () => {
    const { game } = setup({ format: "classique" });
    game.clock.remaining = { w: 1e9, b: 1e9 }; // personne ne joue : on évite la chute du drapeau
    for (let r = 0; r < 3; r++) {
      game.tick(game.params.chessMs * (r + 1) + r);
      game.decideDuel("w", game.params.chessMs * (r + 1) + r);
    }
    expect(game.result).toEqual({ winner: "w", reason: "ko" });
  });

  it("victoire aux points après le dernier round", () => {
    const { game } = setup();
    game.clock.remaining = { w: 1e9, b: 1e9 };
    let t = 0;
    for (const winner of ["w", "b", "w"] as const) {
      t += CHESS;
      game.tick(t);
      game.decideDuel(winner, t);
    }
    expect(game.result).toEqual({ winner: "w", reason: "points" });
  });

  it("le drapeau fait perdre pendant un round d'échecs", () => {
    const { game } = setup({ format: "blitz" });
    // Les Blancs ne jouent pas : leur pendule (3 min) tombe pendant le 2e round d'échecs.
    game.tick(CHESS);
    game.decideDuel(null, CHESS);
    game.tick(CHESS + 60_001);
    expect(game.result).toEqual({ winner: "b", reason: "temps" });
  });

  it("« Ajoute une prise » : départ de 3 prises, chacun ajoute, la chute perd", () => {
    const { game, requests } = setup({ duel: "ajoute" });
    game.tick(CHESS);
    expect(requests[0].length).toBe(3);
    const duel = () => game.duel as Extract<NonNullable<typeof game.duel>, { format: "ajoute" }>;
    expect(duel().sequence).toEqual(["A1", "B2", "C3"]);
    game.ajouteSuccess("D4");
    expect(duel().climber).toBe("b");
    expect(() => game.ajouteSuccess("D4")).toThrow();
    game.ajouteFall(CHESS + 10);
    expect(game.duels.at(-1)).toEqual({ round: 0, winner: "w" });
  });

  it("« Bloc imposé » : budget, compositions croisées, égalité → nouveau budget", () => {
    const { game } = setup({ duel: "impose" });
    game.tick(CHESS);
    expect(() => game.imposeCompose("w", ["A1", "B2", "C3"], 1500)).toThrow(/trop dur/);
    game.imposeCompose("w", ["A1", "B2", "C3"], 1350);
    game.imposeCompose("b", ["D4", "E5", "F6"], 1400);
    game.imposeResult("w", true, CHESS);
    game.imposeResult("b", true, CHESS);
    const duel = game.duel as Extract<NonNullable<typeof game.duel>, { format: "impose" }>;
    expect(duel.budget).toBe(1500);
    expect(duel.step).toBe("compose");
    game.imposeCompose("w", ["A1", "B2", "C3"], 1500);
    game.imposeCompose("b", ["D4", "E5", "F6"], 1500);
    game.imposeResult("w", false, CHESS);
    game.imposeResult("b", true, CHESS);
    expect(game.duels.at(-1)).toEqual({ round: 0, winner: "b" });
  });

  it("famille B : bonus au gagnant (+30 s ou joker), pièce la plus active", () => {
    const { game, requests } = setup({ family: "B" });
    game.play("e2" as Square, "e4" as Square, undefined, 0);
    game.tick(CHESS);
    expect(requests[0].piece).toBe(mostActivePiece(game.chess.fen(), "b"));
    game.memeResult("w", { success: true, attempts: 1, highest: 5 }, CHESS);
    game.memeResult("b", { success: false, attempts: 3, highest: 2 }, CHESS);
    expect(game.stage).toBe("bonus");
    const before = game.clock.remainingAt("w", CHESS);
    game.chooseBonus("temps", CHESS);
    expect(game.clock.remainingAt("w", CHESS)).toBe(before + 30_000);
    expect(game.stage).toBe("echecs");
  });

  it("sauvegarde et reprise en plein duel", () => {
    const { game } = setup({ duel: "ajoute" });
    game.play("e2" as Square, "e4" as Square, undefined, 0);
    game.tick(CHESS);
    game.ajouteSuccess("D4");
    const restored = RoundsGame.restore(JSON.parse(JSON.stringify(game.save(CHESS + 5000))), () => null, 999_999);
    expect(restored.stage).toBe("mur");
    expect(restored.stageRemaining(999_999)).toBe(ROUNDS.blitz.wallMs - 5000);
    expect(restored.chess.fen()).toBe(game.chess.fen());
    restored.ajouteFall(999_999);
    expect(restored.duels.at(-1)?.winner).toBe("w");
  });
});

describe("outils", () => {
  it("pièce la plus active", () => {
    // Après 1.e4 : le fou f1 a 5 coups, la dame 4.
    expect(mostActivePiece("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "w")).toBe("fou");
    expect(mostActivePiece("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "w")).toBe("tour");
  });
  it("comparaison « Même bloc »", () => {
    expect(compareMeme("w", { success: false, attempts: 3, highest: 4 }, "b", { success: false, attempts: 3, highest: 5 })).toBe("b");
    expect(compareMeme("w", { success: true, attempts: 2, highest: 7 }, "b", { success: true, attempts: 2, highest: 7 })).toBeNull();
  });
});

describe("joker", () => {
  it("se gagne au mur, s'utilise une fois, à son tour", () => {
    const { game } = setup({ family: "B" });
    expect(() => game.useJoker("w")).toThrow();
    game.tick(CHESS);
    game.decideDuel("w", CHESS);
    game.chooseBonus("joker", CHESS);
    game.useJoker("w");
    expect(game.jokerAvailable.w).toBe(false);
    expect(() => game.useJoker("w")).toThrow();
  });
});

describe("rounds en solo", () => {
  const solo = (duel: "ajoute" | "meme" | "impose", family: "A" | "B" = "A") =>
    setup({ duel, family, engine: { color: "b", elo: 1500 }, players: { w: { name: "Alice", climbRating: 1500 }, b: { name: "Stockfish", climbRating: 0 } } });

  it("bloc progressif : une prise dévoilée par réussite, gagné à la longueur cible", () => {
    const { game, requests } = solo("ajoute");
    game.tick(CHESS);
    expect(requests[0]).toMatchObject({ targetRating: 1400, length: 6 });
    const duel = () => game.duel as Extract<NonNullable<typeof game.duel>, { format: "solo" }>;
    expect(duel().shown).toBe(3);
    for (let i = 0; i < 3; i++) game.soloResult(true, CHESS);
    expect(duel().shown).toBe(6);
    game.soloResult(true, CHESS);
    expect(game.duels.at(-1)).toEqual({ round: 0, winner: "w" });
  });

  it("bloc cible : 2 essais en Blitz, sinon le moteur gagne le duel", () => {
    const { game } = solo("meme");
    game.tick(CHESS);
    game.soloResult(false, CHESS);
    expect(game.stage).toBe("mur");
    game.soloResult(false, CHESS);
    expect(game.duels.at(-1)).toEqual({ round: 0, winner: "b" });
  });

  it("bloc imposé par le moteur : plus dur, un seul essai ; en famille B le moteur prend +30 s", () => {
    const { game, requests } = solo("impose", "B");
    game.tick(CHESS);
    expect(requests[0].targetRating).toBe(1600);
    const before = game.clock.remainingAt("b", CHESS);
    game.soloResult(false, CHESS);
    expect(game.stage).toBe("echecs");
    expect(game.clock.remainingAt("b", CHESS)).toBe(before + 30_000);
  });
});

describe("rounds sur un mur à voies", () => {
  it("le duel « Même bloc » porte sur une voie", async () => {
    const { routeIdOf } = await import("./rounds");
    const game = new RoundsGame(
      { family: "A", format: "blitz", duel: "meme", players: { w: { name: "A", climbRating: 1500 }, b: { name: "B", climbRating: 1500 } } },
      () => ({ holds: [], estimatedRating: 1500, relaxations: [], route: { id: "v3", label: "vert 6b", color: "vert", grade: "6b", styles: [] } }),
      0,
    );
    game.tick(CHESS);
    const duel = game.duel as Extract<NonNullable<typeof game.duel>, { format: "meme" }>;
    expect(routeIdOf(duel.block)).toBe("v3");
  });
});

describe("rounds en solo : pendule", () => {
  it("incrément pour le joueur à chaque coup", () => {
    const { game } = setup({ engine: { color: "b", elo: 1500 }, players: { w: { name: "A", climbRating: 1500 }, b: { name: "SF", climbRating: 0 } } });
    game.play("e2" as Square, "e4" as Square, undefined, 10_000);
    expect(game.clock.remainingAt("w", 10_000)).toBe(ROUNDS.blitz.clockMs - 10_000 + 5_000);
  });
});
