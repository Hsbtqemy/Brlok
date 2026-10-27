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

describe("placement", () => {
  it("adapte la difficulté et fixe une cote cohérente", async () => {
    const { nextPlacementTarget } = await import("./placement");
    const { recordPlacement } = await import("./players");
    expect(nextPlacementTarget([])).toBe(1500);
    expect(nextPlacementTarget([{ target: 1500, blockRating: 1500, success: true }])).toBe(1700);
    expect(nextPlacementTarget([{ target: 1500, blockRating: 1500, success: false }])).toBe(1300);

    const run = (successes: boolean[]) => {
      let state = createPlayer(emptyRatingsState(), "Alice", "a");
      const attempts = successes.map((success, i) => ({
        block: { ...block, holds: block.holds.map((h) => ({ ...h, id: `${h.id}${i}` })), estimatedRating: 1300 + 100 * i },
        result: { target: 1300 + 100 * i, blockRating: 1300 + 100 * i, success },
      }));
      state = recordPlacement(state, "a", "pan", attempts, "2026-10-27T10:00:00.000Z");
      return state;
    };
    const strong = run([true, true, true, true, true]);
    const weak = run([false, false, false, false, false]);
    const mixed = run([true, true, false, true, false]);
    const r = (s: ReturnType<typeof run>) => s.players[0].ratings.grimpe;
    expect(r(strong).rating).toBeGreaterThan(r(mixed).rating);
    expect(r(mixed).rating).toBeGreaterThan(r(weak).rating);
    // Un seul calcul pour les 5 blocs : pas de saut extrême, et l'incertitude baisse nettement.
    expect(Math.abs(r(mixed).rating - 1500)).toBeLessThan(200);
    expect(r(mixed).rd).toBeLessThan(250);
    expect(mixed.players[0].placedAt).toBe("2026-10-27T10:00:00.000Z");
    expect(mixed.attempts.filter((a) => a.context === "placement")).toHaveLength(5);
  });
});
