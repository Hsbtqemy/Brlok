import { describe, expect, it } from "vitest";
import type { Block } from "./generator";
import { blockKey, createPlayer, emptyRatingsState, recordBlockAttempt, recordGame } from "./players";

const block: Block = {
  holds: ["A1", "B2", "C3"].map((id, i) => ({ id, level: 3, tags: [], position: { row: i, col: i }, active: true })),
  estimatedRating: 1400,
  relaxations: [],
};

describe("joueurs et cotes", () => {
  it("une réussite fait monter le grimpeur et baisser le bloc, et s'inscrit au journal", () => {
    let state = createPlayer(emptyRatingsState(), "Alice", "a");
    const result = recordBlockAttempt(state, "a", "pan", block, true, "libre");
    state = result.state;
    expect(result.delta).toBeGreaterThan(0);
    expect(state.players[0].ratings.grimpe.rating).toBeGreaterThan(1500);
    expect(state.blocks[blockKey("pan", ["A1", "B2", "C3"])].rating).toBeLessThan(1400);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ success: true, blockRating: 1400 });
  });

  it("le bloc garde sa cote d'une tentative à l'autre", () => {
    let state = createPlayer(emptyRatingsState(), "Alice", "a");
    state = recordBlockAttempt(state, "a", "pan", block, false, "libre").state;
    const after1 = state.blocks[blockKey("pan", ["A1", "B2", "C3"])].rating;
    expect(after1).toBeGreaterThan(1400);
    state = recordBlockAttempt(state, "a", "pan", block, false, "libre").state;
    expect(state.blocks[blockKey("pan", ["A1", "B2", "C3"])].rating).toBeGreaterThan(after1);
  });

  it("une partie met à jour la cote Chesscalade des deux joueurs", () => {
    let state = createPlayer(createPlayer(emptyRatingsState(), "Alice", "a"), "Bruno", "b");
    state = recordGame(state, "a", "b", 1, "mat");
    expect(state.players.find((p) => p.id === "a")!.ratings.chesscalade.rating).toBeGreaterThan(1500);
    expect(state.players.find((p) => p.id === "b")!.ratings.chesscalade.rating).toBeLessThan(1500);
    expect(state.players[0].ratings.echecs.rating).toBe(1500);
    expect(state.games).toHaveLength(1);
  });
});
