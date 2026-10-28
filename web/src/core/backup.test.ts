import { describe, expect, it } from "vitest";
import { describeBackup, makeBackup, parseBackup } from "./backup";
import { addFavorite, emptyLibrary, saveTemplate } from "./library";
import { createPlayer, emptyRatingsState } from "./players";
import { createEmptyWall } from "./wall";

describe("sauvegarde complète", () => {
  it("aller-retour JSON, avec l'ancien format de photo repris en secteur", () => {
    const gym = { ...createEmptyWall("salle", "Salle", 0, 0), kind: "voies" as const, photo: "data:A" };
    const ratings = createPlayer(emptyRatingsState(), "Alice", "a");
    const text = JSON.stringify(makeBackup([gym], ratings, { kind: "game" }, undefined, "2026-10-28T10:00:00.000Z"));
    const back = parseBackup(text);
    expect(back.walls[0].sectors?.[0].photo).toBe("data:A");
    expect(back.ratings.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(back.liveGame).toEqual({ kind: "game" });
    expect(describeBackup(back)).toBe("1 mur(s), 1 photo(s), 1 joueur(s), 0 tentative(s), 0 partie(s), une partie en cours");
  });

  it("garde favoris, modèles et historique ; une ancienne sauvegarde n'en a pas", () => {
    let library = saveTemplate(emptyLibrary(), "Force", { kind: "pan", level: 4, pattern: "uniforme", blocks: 5, holds: 8, variety: true, requiredTags: [], excludedTags: [] });
    library = addFavorite(library, "pan", { holds: [], estimatedRating: 1500, relaxations: [], route: { id: "r", label: "Vert", color: "vert", grade: "5c", styles: [] } }, "Vert").lib;
    const back = parseBackup(JSON.stringify(makeBackup([], emptyRatingsState(), null, library)));
    expect(back.library?.templates.map((t) => t.name)).toEqual(["Force"]);
    expect(describeBackup(back)).toContain("1 favori(s), 1 modèle(s)");
    const old = parseBackup(JSON.stringify({ app: "brlok-web", version: 1, walls: [], ratings: {} }));
    expect(old.library).toBeNull();
  });

  it("refuse ce qui n'est pas une sauvegarde", () => {
    expect(() => parseBackup("pas du json")).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ walls: [] }))).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup(JSON.stringify({ app: "brlok-web", version: 99, walls: [], ratings: {} }))).toThrow(/plus récente/);
  });
});
