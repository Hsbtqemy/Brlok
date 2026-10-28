import { describe, expect, it } from "vitest";
import { describeBackup, makeBackup, parseBackup } from "./backup";
import { createPlayer, emptyRatingsState } from "./players";
import { createEmptyWall } from "./wall";

describe("sauvegarde complète", () => {
  it("aller-retour JSON, avec l'ancien format de photo repris en secteur", () => {
    const gym = { ...createEmptyWall("salle", "Salle", 0, 0), kind: "voies" as const, photo: "data:A" };
    const ratings = createPlayer(emptyRatingsState(), "Alice", "a");
    const text = JSON.stringify(makeBackup([gym], ratings, { kind: "game" }, "2026-10-28T10:00:00.000Z"));
    const back = parseBackup(text);
    expect(back.walls[0].sectors?.[0].photo).toBe("data:A");
    expect(back.ratings.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(back.liveGame).toEqual({ kind: "game" });
    expect(describeBackup(back)).toBe("1 mur(s), 1 photo(s), 1 joueur(s), 0 tentative(s), 0 partie(s), une partie en cours");
  });

  it("refuse ce qui n'est pas une sauvegarde", () => {
    expect(() => parseBackup("pas du json")).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ walls: [] }))).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup(JSON.stringify({ app: "brlok-web", version: 99, walls: [], ratings: {} }))).toThrow(/plus récente/);
  });
});
