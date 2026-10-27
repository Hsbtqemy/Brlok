import { describe, expect, it } from "vitest";
import { footBonus, pickNoFootMove } from "./feet";
import { ChesscaladeGame, type BlockRequest } from "./game";
import { generateChessBlock } from "./generator";
import { blockKey, createPlayer, emptyRatingsState, recordBlockAttempt } from "./players";
import { seededRng } from "./random";
import { createEmptyWall, holdId, type Wall } from "./wall";

function wall(): Wall {
  const w = createEmptyWall("p", "Pan", 7, 6);
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 6; col++) w.holds.push({ id: holdId({ row, col }), level: ((row * 2 + col) % 6) + 1, tags: [], position: { row, col }, active: true });
  return w;
}

describe("règles de pieds (§7.6)", () => {
  it("la règle compte dans la cote : les prises visent plus bas", () => {
    const plain = generateChessBlock(wall(), { piece: null, targetRating: 1600, length: 6, rng: seededRng(1) })!;
    const feet = generateChessBlock(wall(), { piece: null, targetRating: 1600, length: 6, feet: "mains", rng: seededRng(1) })!;
    expect(feet.feet).toBe("mains");
    expect(feet.estimatedRating - footBonus("mains")).toBeLessThanOrEqual(plain.estimatedRating);
    expect(Math.abs(feet.estimatedRating - 1600)).toBeLessThan(250);
  });

  it("« sans pied » désigne un mouvement, jamais le départ quand le bloc est assez long", () => {
    for (let s = 0; s < 20; s++) {
      const m = pickNoFootMove(5, seededRng(s));
      expect(m).toBeGreaterThanOrEqual(2);
      expect(m).toBeLessThanOrEqual(5);
    }
    const b = generateChessBlock(wall(), { piece: null, targetRating: 1700, length: 6, feet: "sans-pied", rng: seededRng(3) })!;
    expect(b.noFootMove).toBeGreaterThanOrEqual(2);
  });

  it("le même enchaînement avec une autre règle de pieds est un autre bloc (cote séparée)", () => {
    expect(blockKey("p", ["A1", "B2"])).toBe("p:A1-B2");
    expect(blockKey("p", ["A1", "B2"], "mains")).toBe("p:A1-B2~mains");
    const holds = [{ id: "A1", level: 3, tags: [], position: { row: 0, col: 0 }, active: true }];
    let state = createPlayer(emptyRatingsState(), "Alice", "a");
    state = recordBlockAttempt(state, "a", "p", { holds, estimatedRating: 1500, relaxations: [], feet: "mains" }, true, "libre").state;
    expect(Object.keys(state.blocks)).toEqual(["p:A1~mains"]);
    expect(state.attempts[0].feet).toBe("mains");
  });

  it("en partie : règle selon le niveau, sauf pour la parade", () => {
    const requests: BlockRequest[] = [];
    const mk = (difficulty: "modere" | "difficile" | "diabolique", feet?: "auto" | "prises") =>
      new ChesscaladeGame(
        {
          format: "classique",
          difficulty,
          deviation: "courte",
          feet,
          players: { w: { name: "A", climbRating: 1500, fatigue: false }, b: { name: "B", climbRating: 1500, fatigue: false } },
        },
        (r) => (requests.push(r), null),
        0,
      );
    expect(mk("modere").footRule("defi")).toBe("libres");
    expect(mk("difficile").footRule("defi")).toBe("mains");
    expect(mk("diabolique").footRule("recharge")).toBe("sans-pied");
    expect(mk("diabolique").footRule("parade")).toBe("libres");
    expect(mk("modere", "prises").footRule("cloche")).toBe("prises");
    const g = mk("difficile");
    g.requestRecharge(false, 0);
    expect(requests.at(-1)?.feet).toBe("mains");
  });
});
