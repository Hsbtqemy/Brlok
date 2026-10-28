import { describe, expect, it } from "vitest";
import brlokData from "../../../data/catalog_collection.json";
import {
  beamFromDesktop,
  beamHoldName,
  beamToDesktop,
  hangBlock,
  hangRating,
  hangText,
  pickHang,
  specTags,
  specText,
  withBeam,
  withFinishes,
} from "./beam";
import { exportBrlok, importBrlok } from "./brlokImport";
import { generateClassicSession, generateChessBlock } from "./generator";
import { blockLabel, blockSignature, refreshBlock } from "./library";
import { createPlayer, emptyRatingsState, recordBlockAttempt } from "./players";
import { seededRng } from "./random";
import { createEmptyWall, holdAt, holdId, type Wall } from "./wall";

const catalog = (brlokData as { catalogs: { catalog: { foot_grid: string[][]; foot_levels: number[][] } }[] }).catalogs[0].catalog;
const beam = beamFromDesktop(catalog.foot_grid, catalog.foot_levels)!;

function pan(rows = 7, cols = 6): Wall {
  const wall = createEmptyWall("pan", "Pan", rows, cols);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const position = { row, col };
      wall.holds.push({ id: holdId(position), level: 3, tags: [], position, active: true });
    }
  return wall;
}

describe("poutre : description", () => {
  it("reprend la grille pieds de Brlok desktop (cases vides écartées)", () => {
    expect(beam.rows).toBe(4);
    expect(beam.cols).toBe(6);
    expect(beam.holds).toHaveLength(20);
    const pa1 = beam.holds.find((h) => h.id === "PA1")!;
    expect(pa1).toMatchObject({ label: "[Bac]", level: 1, tags: ["bac"], position: { row: 0, col: 0 } });
    expect(beam.holds.find((h) => h.id === "PB2")).toBeUndefined();
    expect(beam.holds.find((h) => h.id === "PC4")).toMatchObject({ label: "18", level: 4, tags: ["réglette"] });
  });

  it("types et étiquettes lisibles", () => {
    expect(specTags("[35°]")).toEqual(["plat"]);
    expect(specTags("bi30")).toEqual(["bi-doigt"]);
    expect(specTags("45")).toEqual(["réglette"]);
    expect(specText("[35°]")).toBe("35°");
    expect(specText("bi50")).toBe("bi 50");
    expect(specText("25")).toBe("25 mm");
    expect(beamHoldName(beam.holds.find((h) => h.id === "PA2")!)).toBe("25 mm");
  });

  it("aller-retour Brlok desktop", () => {
    const back = beamToDesktop(beam);
    expect(back.foot_grid).toEqual(catalog.foot_grid);
    expect(back.foot_levels).toEqual(catalog.foot_levels);
    expect(back.cut).toBe(0);
    const [{ wall }] = importBrlok(brlokData);
    expect(wall.beam?.holds).toHaveLength(20);
    // Fusionnée aux prises (ancienne option), la grille n'est pas en plus une poutre.
    expect(importBrlok(brlokData, { footRowOffset: 0 })[0].wall.beam).toBeUndefined();
    const out = exportBrlok([wall]).data.catalogs[0].catalog as { foot_grid?: string[][] };
    expect(out.foot_grid).toEqual(catalog.foot_grid);
  });

  it("sans poutre, une grille pieds vide (Brlok desktop ne remet pas la sienne) ; un type sans étiquette revient", () => {
    const out = exportBrlok([pan()]).data.catalogs[0].catalog as { foot_grid?: string[][] };
    expect(out.foot_grid).toHaveLength(4);
    expect(out.foot_grid!.flat().every((c) => c === "")).toBe(true);
    expect(beamFromDesktop(out.foot_grid, undefined)).toBeUndefined();
    const typed = { ...beam, holds: [{ id: "PA1", level: 2, tags: ["pince"], position: { row: 0, col: 0 }, active: true }] };
    const back = beamToDesktop(typed);
    expect(beamFromDesktop(back.foot_grid, back.foot_levels)!.holds[0].tags).toEqual(["pince"]);
  });

  it("une poutre plus grande que 4 × 6 est coupée à l'export", () => {
    const big = { ...beam, holds: [...beam.holds, { id: "PG5", level: 2, tags: [], position: { row: 4, col: 6 }, active: true }] };
    expect(beamToDesktop(big).cut).toBe(1);
  });
});

describe("poutre intégrée au pan", () => {
  it("au-dessus de la rangée du haut (bas du mur = dernière rangée)", () => {
    const w = withBeam({ ...pan(), beam: { ...beam, placement: "integree" } });
    expect(w.rows).toBe(11);
    expect(w.holds).toHaveLength(42 + 20);
    expect(holdAt(w, { row: 0, col: 0 })?.id).toBe("PA1");
    expect(holdAt(w, { row: 4, col: 0 })?.id).toBe("A1");
    expect(holdAt(w, { row: 10, col: 5 })?.id).toBe("F7");
  });

  it("bas du mur = rangée 1 : la poutre au-dessus de la dernière rangée, rangée 1 en haut", () => {
    const w = withBeam({ ...pan(), bottom: "first", beam: { ...beam, placement: "integree" } });
    expect(holdAt(w, { row: 6, col: 0 })?.id).toBe("A7");
    expect(holdAt(w, { row: 10, col: 0 })?.id).toBe("PA1");
    expect(holdAt(w, { row: 7, col: 0 })?.id).toBe("PA4");
  });

  it("centrée sur un pan plus large ; à part, le mur ne change pas", () => {
    const w = withBeam({ ...pan(7, 8), beam: { ...beam, placement: "integree" } });
    expect(holdAt(w, { row: 0, col: 1 })?.id).toBe("PA1");
    const apart = { ...pan(), beam };
    expect(withBeam(apart)).toBe(apart);
  });

  it("les blocs passent par la poutre, à portée de la rangée du haut", () => {
    const w = withBeam({ ...pan(), beam: { ...beam, placement: "integree" } });
    const ids = new Set(generateClassicSession(w, { targetLevel: 3, blocksCount: 10, holdsPerBlock: 8, rng: seededRng(5) }).flatMap((b) => b.holds.map((h) => h.id)));
    expect([...ids].some((id) => id.startsWith("P"))).toBe(true);
    const block = generateChessBlock(w, { piece: "tour", targetRating: 1500, length: 6, rng: seededRng(3) });
    expect(block).not.toBeNull();
  });
});

describe("suspensions", () => {
  it("cote : niveaux, écart entre les mains, durée", () => {
    expect(hangRating([1, 1], 10)).toBe(1000);
    expect(hangRating([4, 4], 10)).toBe(1600);
    expect(hangRating([5, 5], 15)).toBe(1925);
    expect(hangRating([1, 5], 10)).toBe(1500 + 200 * (3 - 3.5) + 100 * 2);
  });

  it("bloc d'une suspension : prises, cote, texte", () => {
    const b = hangBlock(beam, { left: "PA1", right: "PF1", seconds: 7 })!;
    expect(b.holds.map((h) => h.id)).toEqual(["PA1", "PF1"]);
    expect(b.estimatedRating).toBe(hangRating([1, 1], 7));
    expect(hangText(b)).toBe("Bac / Bac · 7 s");
    expect(hangText(hangBlock(beam, { left: "PA1", right: "PA1", seconds: 10 })!)).toBe("Bac (2 mains) · 10 s");
    expect(blockLabel(b)).toBe("Poutre · Bac / Bac · 7 s");
    expect(hangBlock(beam, { left: "PA1", right: "PZ9", seconds: 7 })).toBeNull();
  });

  it("choisie par l'app : une main de chaque côté, au plus près de la cote, symétrique de préférence", () => {
    for (const target of [1000, 1300, 1600, 1900]) {
      const b = pickHang(beam, { targetRating: target, seconds: 10, rng: seededRng(target) })!;
      const [l, r] = [b.hang!.left, b.hang!.right].map((id) => beam.holds.find((h) => h.id === id)!);
      expect(l.position.col).toBeLessThan(3);
      expect(r.position.col).toBeGreaterThanOrEqual(3);
      expect(Math.abs(b.estimatedRating - target)).toBeLessThanOrEqual(250);
    }
    // 1000 : une paire jumelle de niveau 1 (bacs, ou réglettes de 45 mm).
    for (let seed = 1; seed <= 5; seed++) {
      const easy = pickHang(beam, { targetRating: 1000, seconds: 10, rng: seededRng(seed) })!;
      expect(easy.estimatedRating).toBe(1000);
      expect(["PA1|PF1", "PA3|PF3"]).toContain(`${easy.hang!.left}|${easy.hang!.right}`);
    }
  });

  it("varie les prises d'une suspension à l'autre", () => {
    const usage = new Map<string, number>();
    const picks = Array.from({ length: 6 }, (_, i) => pickHang(beam, { targetRating: 1500, seconds: 10, usage, rng: seededRng(i) })!.hang!.left);
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("compte pour la cote de grimpe, avec sa propre cote", () => {
    const state = createPlayer(emptyRatingsState(), "Alice", "a");
    const b = hangBlock(beam, { left: "PC4", right: "PD4", seconds: 10 })!;
    const { state: next, delta } = recordBlockAttempt(state, "a", "pan", b, true, "libre", "2026-10-28T10:00:00Z");
    expect(delta).toBeGreaterThan(0);
    expect(Object.keys(next.blocks)).toEqual(["pan:poutre:PC4|PD4:10"]);
    expect(next.attempts[0].holds).toEqual(["Poutre 18 mm / 18 mm · 10 s"]);
  });

  it("favori et mise à jour : suivent la poutre du mur", () => {
    const wall = { ...pan(), beam };
    const b = hangBlock(beam, { left: "PA1", right: "PF1", seconds: 10 })!;
    expect(blockSignature("pan", b)).toBe("pan|poutre:PA1|PF1:10");
    // Le même bloc avec ou sans sortie à la poutre : deux favoris différents.
    const plain = { holds: [wall.holds[0]], estimatedRating: 1400, relaxations: [] };
    expect(blockSignature("pan", plain)).not.toBe(blockSignature("pan", { ...plain, finish: b }));
    const harder = { ...wall, beam: { ...beam, holds: beam.holds.map((h) => (h.id === "PA1" ? { ...h, level: 3 } : h)) } };
    expect(refreshBlock(harder, b)?.estimatedRating).toBe(hangRating([3, 1], 10));
    expect(refreshBlock({ ...wall, beam: undefined }, b)).toBeNull();
  });

  it("sortie à la poutre : chaque bloc de la séance finit par une suspension", () => {
    const wall = pan();
    const blocks = withFinishes(generateClassicSession(wall, { targetLevel: 2, blocksCount: 3, holdsPerBlock: 5, rng: seededRng(2) }), beam, { level: 2, seconds: 5, rng: seededRng(2) });
    expect(blocks.every((b) => b.finish?.hang?.seconds === 5)).toBe(true);
    // La sortie ne change pas la cote du bloc ; elle suit la poutre quand on remet le bloc à jour.
    const fresh = refreshBlock({ ...wall, beam }, blocks[0])!;
    expect(fresh.finish?.hang).toEqual(blocks[0].finish?.hang);
    expect(refreshBlock(wall, blocks[0])!.finish).toBeUndefined();
  });
});
