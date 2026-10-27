import { describe, expect, it } from "vitest";
import { ChesscaladeGame, triggersOf, verdictForFall, type BlockRequest, type Difficulty, type Format, type GameConfig } from "./game";
import { Chess, type Square } from "chess.js";

function setup(format: Format, difficulty: Difficulty, extra: Partial<GameConfig> = {}) {
  const requests: BlockRequest[] = [];
  const config: GameConfig = {
    format,
    difficulty,
    deviation: "courte",
    // Les tests des règles de base jouent en densité « intense » (tous les déclencheurs) ; la densité a ses propres tests.
    density: "intense",
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

describe("solo contre le moteur (§9.1)", () => {
  function solo(difficulty: Difficulty = "difficile") {
    return setup("classique", difficulty, {
      players: {
        w: { name: "Alice", climbRating: 1500, fatigue: false },
        b: { name: "Stockfish", climbRating: 0, fatigue: false },
      },
      engine: { color: "b", elo: 1500 },
    });
  }

  it("le moteur ne grimpe pas : sa prise passe, le joueur grimpe un bloc de défense", () => {
    const { game, requests } = solo();
    playLine(game, ["e2e4", "d7d5", "a2a3"]);
    expect(game.isEngineTurn()).toBe(true);
    game.play("d5", "e4", undefined, 0);
    expect(game.chess.get("e4")?.color).toBe("b");
    expect(game.phase).toBe("block");
    expect(requests.at(-1)).toMatchObject({ climber: "w", kind: "defense", targetRating: 1500 + 150 - 300 - 200 });
    const before = game.clock.remainingAt("w", 0);
    game.blockResult(false, 0);
    expect(game.clock.remainingAt("w", 0)).toBe(before - 30_000);
    expect(game.chess.get("e4")?.color).toBe("b");
  });

  it("pas de parade pour le moteur quand le joueur le met en échec", () => {
    const { game } = solo();
    playLine(game, ["e2e4", "d7d5"]);
    game.play("f1", "b5", undefined, 0); // échec : bloc-défi du joueur
    expect(game.phase).toBe("block");
    game.blockResult(true, 0);
    expect(game.phase).toBe("move");
    expect(game.isEngineTurn()).toBe(true);
  });

  it("contre-attaque réussie : le dernier coup du moteur est annulé et ne peut pas être rejoué", () => {
    const { game, requests } = solo("diabolique");
    playLine(game, ["e2e4", "d7d5", "a2a3"]);
    game.play("d5", "e4", undefined, 0);
    game.blockResult(true, 0); // défense réussie
    expect(game.canCounterAttack()).toBe(true);
    game.requestCounterAttack(0);
    expect(requests.at(-1)).toMatchObject({ kind: "contre-attaque", targetRating: 1500 + 300 + 400 });
    game.blockResult(true, 0);
    expect(game.chess.get("e4")?.color).toBe("w");
    expect(game.isEngineTurn()).toBe(true);
    expect(game.engineCandidates()).not.toContain("d5e4");
    expect(game.canCounterAttack()).toBe(false);
  });

  it("contre-attaque indisponible en Modéré", () => {
    const { game } = solo("modere");
    playLine(game, ["e2e4", "d7d5"]);
    expect(game.canCounterAttack()).toBe(false);
  });
});

describe("réglage du moteur", () => {
  it("utilise UCI_Elo à partir de 1320 et des coups au hasard en dessous", async () => {
    const { engineSettings, pickEngineMove, uciCommands } = await import("./engine");
    expect(engineSettings(1800)).toMatchObject({ limitStrength: true, uciElo: 1800, randomMoveChance: 0 });
    const weak = engineSettings(800);
    expect(weak.limitStrength).toBe(false);
    expect(weak.randomMoveChance).toBeCloseTo(0.4, 1);
    expect(pickEngineMove("e2e4", ["a2a3"], { ...weak, randomMoveChance: 1 }, () => 0)).toBe("a2a3");
    expect(pickEngineMove("e2e4", ["a2a3"], engineSettings(2000), () => 0)).toBe("e2e4");
    expect(uciCommands("fen", engineSettings(1500), ["e2e4", "d2d4"]).at(-1)).toBe("go movetime 700 searchmoves e2e4 d2d4");
  });
});

describe("sauvegarde et reprise", () => {
  it("reprend une partie avec son état complet, à travers du JSON", () => {
    const { game } = setup("classique", "modere");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0); // V2 : pion épuisé
    playLine(game, ["g8f6"]);
    game.play("b1", "c3", undefined, 0);
    playLine(game, ["f6d5"]); // prise : bloc-défi en suspens côté Noirs
    expect(game.phase).toBe("move");
    game.play("c3", "d5", undefined, 10_000); // Cxd5 : bloc-défi en suspens
    expect(game.phase).toBe("block");

    const saved = JSON.parse(JSON.stringify(game.save(20_000)));
    const restored = ChesscaladeGame.restore(saved, () => null, 1_000_000);
    expect(restored.chess.fen()).toBe(game.chess.fen());
    expect(restored.phase).toBe("block");
    expect(restored.pending?.move?.san).toBe("Nxd5");
    expect(restored.pending?.startedAt).toBe(1_000_000);
    expect(restored.consecutiveFalls).toEqual(game.consecutiveFalls);
    expect(restored.clock.remainingAt("w", 1_000_000)).toBe(game.clock.remainingAt("w", 20_000));
    restored.blockResult(true, 1_000_000);
    expect(restored.chess.get("d5")?.type).toBe("n");
    expect(restored.turn).toBe("b");
  });

  it("reprend une déviation en attente", () => {
    const { game } = setup("classique", "diabolique");
    playLine(game, ["e2e4", "d7d5", "d2d4", "c8f5", "b1c3"]);
    game.consecutiveFalls.b = 3;
    game.play("f5", "e4", undefined, 0);
    game.blockResult(false, 0);
    const restored = ChesscaladeGame.restore(JSON.parse(JSON.stringify(game.save(0))), () => null, 0);
    expect(restored.phase).toBe("deviation");
    expect(restored.deviation?.options.map((m) => m.lan)).toEqual(game.deviation?.options.map((m) => m.lan));
    restored.chooseDeviation(restored.deviation!.options[0].to, 0);
    expect(restored.turn).toBe("w");
  });

  it("reprend une contre-attaque en cours (coup du moteur déjà joué)", () => {
    const { game } = setup("classique", "difficile", {
      players: { w: { name: "Alice", climbRating: 1500, fatigue: false }, b: { name: "SF", climbRating: 0, fatigue: false } },
      engine: { color: "b", elo: 1500 },
    });
    playLine(game, ["e2e4", "e7e5"]);
    game.requestCounterAttack(0);
    const restored = ChesscaladeGame.restore(JSON.parse(JSON.stringify(game.save(0))), () => null, 0);
    expect(restored.pending?.move?.lan).toBe("e7e5");
    restored.blockResult(true, 0);
    expect(restored.chess.get("e7")?.type).toBe("p");
    expect(restored.isEngineTurn()).toBe(true);
    expect(restored.engineCandidates()).not.toContain("e7e5");
  });
});

describe("famille C : la cloche (§3.5)", () => {
  it("sonne après 8 min de temps de jeu en Classique ; chacun grimpe, pendules en pause", () => {
    const { game, requests } = setup("classique", "modere", { bell: true });
    game.tick(0);
    game.tick(4 * 60_000); // Blancs réfléchissent 4 min
    game.play("e2", "e4", undefined, 4 * 60_000);
    game.tick(4 * 60_000);
    expect(game.phase).toBe("move");
    game.tick(8 * 60_000); // Noirs réfléchissent 4 min : 8 min de jeu
    expect(game.phase).toBe("block");
    expect(game.clock.running).toBeNull();
    expect(requests.at(-1)).toMatchObject({ kind: "cloche", climber: "b", targetRating: 1400 });
    const before = game.clock.remainingAt("b", 8 * 60_000);
    game.blockResult(false, 8 * 60_000);
    expect(game.clock.remainingAt("b", 8 * 60_000)).toBe(before - 20_000);
    expect(requests.at(-1)).toMatchObject({ kind: "cloche", climber: "w" });
    game.blockResult(true, 8 * 60_000);
    expect(game.phase).toBe("move");
    expect(game.clock.running).toBe("b");
    expect(game.nextBellAt()).toBe(16 * 60_000);
  });

  it("le temps passé à grimper ne compte pas comme temps de jeu", () => {
    const { game } = setup("blitz", "modere", { bell: true });
    game.tick(0);
    game.requestRecharge(false, 0);
    game.tick(3 * 60_000); // 3 min de recharge : pas du temps de jeu
    expect(game.bellPlayTimeMs).toBe(0);
  });

  it("en solo, seul le joueur grimpe à la cloche", () => {
    const { game, requests } = setup("blitz", "modere", {
      bell: true,
      engine: { color: "b", elo: 1500 },
      players: { w: { name: "Alice", climbRating: 1500, fatigue: false }, b: { name: "SF", climbRating: 0, fatigue: false } },
    });
    game.clock.remaining = { w: 10 * 60_000, b: 10 * 60_000 }; // le Blitz (3 min) tomberait avant la cloche
    game.tick(0);
    game.tick(4 * 60_000);
    expect(requests.at(-1)).toMatchObject({ kind: "cloche", climber: "w" });
    game.blockResult(true, 4 * 60_000);
    expect(game.phase).toBe("move");
  });

  it("la cloche est sauvegardée", () => {
    const { game } = setup("classique", "modere", { bell: true });
    game.tick(0);
    game.tick(60_000);
    const restored = ChesscaladeGame.restore(JSON.parse(JSON.stringify(game.save(60_000))), () => null, 0);
    expect(restored.bellPlayTimeMs).toBe(60_000);
    expect(restored.config.bell).toBe(true);
  });
});

describe("densité de blocs (§5.5)", () => {
  it("normale : la reprise sur la même case est gratuite (un échange = un bloc)", () => {
    const { game, requests } = setup("classique", "modere", { density: "normale" });
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0); // exd5 : bloc-défi
    expect(requests).toHaveLength(1);
    game.blockResult(true, 0);
    game.play("d8", "d5", undefined, 0); // Dxd5 : reprise, gratuite
    expect(game.phase).toBe("move");
    expect(requests).toHaveLength(1);
  });

  it("normale : le coup qui suit un bloc ne déclenche rien, le mat toujours", () => {
    const { game, requests } = setup("classique", "modere", { density: "normale" });
    playLine(game, ["e2e4", "f7f6", "d2d4", "g7g5"]);
    game.play("d1", "h5", undefined, 0); // mat : bloc malgré tout
    expect(requests.at(-1)?.kind).toBe("defi");
  });

  it("normale : récupération d'un coup après un bloc-défi, puis les prises redéclenchent", () => {
    const { game, requests } = setup("classique", "modere", { density: "normale" });
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0); // exd5 : bloc
    game.blockResult(true, 0);
    playLine(game, ["c7c6"]);
    const n = requests.length;
    game.play("d5", "c6", undefined, 0); // dxc6 : coup suivant des Blancs, en récupération
    expect(game.phase).toBe("move");
    playLine(game, ["b7c6"]); // bxc6 : reprise gratuite
    expect(requests.length).toBe(n);
    playLine(game, ["d2d4", "g8f6", "c1g5", "e7e6"]);
    game.play("g5", "f6", undefined, 0); // Fxf6 : deux coups plus tard, la prise redéclenche
    expect(requests.length).toBe(n + 1);
  });

  it("normale : après une prise annulée, une autre prise au même coup n'est pas gratuite", () => {
    const { game, requests } = setup("classique", "difficile", { density: "normale" });
    playLine(game, ["e2e4", "d7d5", "b1c3", "g8f6"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0); // V3 : annulé, les Blancs rejouent
    const n = requests.length;
    game.play("c3", "d5", undefined, 0); // Cxd5 : autre prise au même coup, elle aussi un bloc
    expect(game.phase).toBe("block");
    expect(requests.length).toBe(n + 1);
  });

  it("légère : les prises de pion et les échecs ne déclenchent rien", () => {
    const { game, requests } = setup("classique", "modere", { density: "legere" });
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    expect(game.phase).toBe("move");
    expect(requests).toHaveLength(0);
  });

  it("solo normale : la reprise du moteur ne donne pas de défense, une prise de pièce oui", () => {
    const solo = setup("classique", "modere", {
      density: "normale",
      players: { w: { name: "A", climbRating: 1500, fatigue: false }, b: { name: "SF", climbRating: 0, fatigue: false } },
      engine: { color: "b", elo: 1500 },
    });
    const { game, requests } = solo;
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0); // exd5 : bloc-défi du joueur
    game.blockResult(true, 0);
    game.play("d8", "d5", undefined, 0); // le moteur reprend : gratuit
    expect(game.phase).toBe("move");
    expect(requests.filter((r) => r.kind === "defense")).toHaveLength(0);
    playLine(game, ["b1c3"]); // les Blancs (récupération)
    playLine(game, ["d5a5"]);
    playLine(game, ["a2a3"]);
    game.play("a5", "c3", undefined, 0); // le moteur prend un cavalier (pas une reprise)
    expect(requests.at(-1)?.kind).toBe("defense");
  });
});

describe("pendule en solo", () => {
  it("le joueur reçoit un incrément à chaque coup, pas le moteur", () => {
    const { game } = setup("blitz", "modere", {
      players: { w: { name: "A", climbRating: 1500, fatigue: false }, b: { name: "SF", climbRating: 0, fatigue: false } },
      engine: { color: "b", elo: 1500 },
    });
    game.play("e2", "e4", undefined, 10_000); // 10 s de réflexion
    expect(game.clock.remainingAt("w", 10_000)).toBe(3 * 60_000 - 10_000 + 5_000);
    game.play("e7", "e5", undefined, 11_000); // le moteur : 1 s, sans incrément
    expect(game.clock.remainingAt("b", 11_000)).toBe(3 * 60_000 - 1_000);
  });
});

describe("réussir un bloc rapporte du temps", () => {
  it("bloc-défi réussi : +20 s en Classique, avec un message clair", () => {
    const { game } = setup("classique", "modere");
    playLine(game, ["e2e4", "d7d5"]);
    const before = game.clock.remainingAt("w", 0);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(true, 0);
    expect(game.clock.remainingAt("w", 0)).toBe(before + 20_000);
    expect(game.log.at(-1)).toMatchObject({ text: "Bloc réussi : exd5 est joué, et +20 s.", tone: "bon" });
  });

  it("chute : la conséquence est expliquée", () => {
    const { game } = setup("classique", "modere");
    playLine(game, ["e2e4", "d7d5"]);
    game.play("e4", "d5", undefined, 0);
    game.blockResult(false, 0);
    expect(game.log.at(-1)).toMatchObject({ text: "Chute : exd5 est joué, mais ton pion ne pourra pas bouger au prochain tour.", tone: "mauvais" });
  });
});
