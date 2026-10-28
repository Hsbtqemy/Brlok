import { describe, expect, it } from "vitest";
import { createEmptyWall, joinPhotos, migrateWall, routePhoto, sectorOf, splitPhotos } from "./wall";
import { duplicateWall, linksOf, newWall, resizeWall, setHold, toggleForbiddenLink, toggleTag } from "./wallEdit";

describe("édition du pan", () => {
  it("ajoute, modifie et retire une prise", () => {
    let wall = createEmptyWall("p", "Pan", 7, 6);
    wall = setHold(wall, { row: 0, col: 2 }, { level: 9 });
    expect(wall.holds).toEqual([{ id: "C1", level: 6, tags: [], position: { row: 0, col: 2 }, active: true }]);
    wall = setHold(wall, { row: 0, col: 2 }, { tags: toggleTag([], "réglette"), active: false });
    expect(wall.holds[0]).toMatchObject({ level: 6, tags: ["réglette"], active: false });
    wall = setHold(wall, { row: 0, col: 2 }, null);
    expect(wall.holds).toEqual([]);
  });

  it("redimensionne en retirant les prises hors grille et leurs enchaînements", () => {
    let wall = createEmptyWall("p", "Pan", 7, 6);
    wall = setHold(wall, { row: 0, col: 0 }, { level: 2 });
    wall = setHold(wall, { row: 6, col: 5 }, { level: 3 });
    wall = toggleForbiddenLink(wall, "A1", "F7");
    const { wall: small, removed } = resizeWall(wall, 5, 6);
    expect(removed).toEqual(["F7"]);
    expect(small.rows).toBe(5);
    expect(small.forbiddenLinks).toEqual([]);
  });

  it("marque et démarque un enchaînement impossible, dans les deux sens", () => {
    let wall = createEmptyWall("p", "Pan", 7, 6);
    wall = toggleForbiddenLink(wall, "A1", "B2");
    expect(linksOf(wall, "B2")).toEqual(["A1"]);
    wall = toggleForbiddenLink(wall, "B2", "A1");
    expect(wall.forbiddenLinks).toEqual([]);
  });

  it("crée et duplique un pan", () => {
    const wall = newWall("Garage", 8, 8, "g");
    expect(wall).toMatchObject({ id: "g", name: "Garage", rows: 8, cols: 8, holds: [] });
    const copy = duplicateWall(setHold(wall, { row: 1, col: 1 }, { level: 4 }), "", "g2");
    expect(copy).toMatchObject({ id: "g2", name: "Garage (copie)" });
    expect(copy.holds).toHaveLength(1);
  });
});

describe("pan express", () => {
  it("une prise par case, toutes au même niveau, et on peut jouer tout de suite", async () => {
    const { expressWall, cycleLevel } = await import("./wallEdit");
    const { generateChessBlock } = await import("./generator");
    const { seededRng } = await import("./random");
    const wall = expressWall("Express", 5, 4, undefined, "x");
    expect(wall.holds).toHaveLength(20);
    expect(new Set(wall.holds.map((h) => h.level))).toEqual(new Set([3]));
    const block = generateChessBlock(wall, { piece: "cavalier", targetRating: 1500, length: 5, rng: seededRng(1) });
    expect(block?.holds.length).toBeGreaterThanOrEqual(3);
    let painted = cycleLevel(wall, { row: 0, col: 0 });
    expect(painted.holds.find((h) => h.id === "A1")?.level).toBe(4);
    for (let i = 0; i < 3; i++) painted = cycleLevel(painted, { row: 0, col: 0 });
    expect(painted.holds.find((h) => h.id === "A1")?.level).toBe(1);
  });
});

describe("secteurs d'un mur à voies", () => {
  const base = { ...createEmptyWall("salle", "Salle", 0, 0), kind: "voies" as const };

  it("l'ancienne photo unique devient le premier secteur, et les voies le suivent", () => {
    const old = { ...base, photo: "data:A", routes: [{ id: "v1", name: "", color: "vert", grade: "6a", styles: [] }] };
    const w = migrateWall(old);
    expect(w.photo).toBeUndefined();
    expect(w.sectors).toEqual([{ id: "s1", name: "Secteur 1", photo: "data:A" }]);
    expect(routePhoto(old, old.routes[0])).toBe("data:A");
    expect(migrateWall(w)).toBe(w);
  });

  it("les photos se rangent à part et se remettent en place", () => {
    const w = { ...base, sectors: [{ id: "s1", name: "Bloc", photo: "data:A" }, { id: "s2", name: "Dévers", photo: "data:B" }] };
    const { wall, photos } = splitPhotos(w);
    expect(wall.sectors).toEqual([{ id: "s1", name: "Bloc" }, { id: "s2", name: "Dévers" }]);
    expect(photos).toEqual([{ sectorId: "s1", data: "data:A" }, { sectorId: "s2", data: "data:B" }]);
    const store = new Map(photos.map((p) => [p.sectorId, p.data]));
    expect(joinPhotos(wall, (id) => store.get(id))).toEqual(w);
  });

  it("une voie va avec son secteur, ou le premier par défaut", () => {
    const w = { ...base, sectors: [{ id: "s1", name: "Bloc" }, { id: "s2", name: "Dévers" }] };
    const r = { id: "v", name: "", color: "vert", grade: "6a", styles: [] };
    expect(sectorOf(w, r)?.id).toBe("s1");
    expect(sectorOf(w, { ...r, sectorId: "s2" })?.id).toBe("s2");
    expect(sectorOf(w, { ...r, sectorId: "supprimé" })?.id).toBe("s1");
  });
});
