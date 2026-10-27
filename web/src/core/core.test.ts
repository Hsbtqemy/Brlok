import { describe, expect, it } from "vitest";
import brlokData from "../../../data/catalog_collection.json";
import { estimateBlockRating, ratingToLevel } from "./blockRating";
import { exportBrlok, importBrlok } from "./brlokImport";
import { distributionLevels } from "./distribution";
import { generateChessBlock, generateClassicSession } from "./generator";
import { newRating, recordAttempt, updateRating } from "./glicko2";
import { pathFits, PIECES } from "./pieces";
import { seededRng } from "./random";
import { columnLabel, createEmptyWall, distance, holdId, type Wall } from "./wall";

function fullWall(levelOf: (row: number, col: number) => number = () => 3): Wall {
  const wall = createEmptyWall("test", "Test", 7, 6);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 6; col++) {
      const position = { row, col };
      wall.holds.push({ id: holdId(position), level: levelOf(row, col), tags: [], position, active: true });
    }
  }
  return wall;
}

describe("wall", () => {
  it("nomme les prises comme Brlok desktop", () => {
    expect(holdId({ row: 0, col: 2 })).toBe("C1");
    expect(holdId({ row: 6, col: 5 })).toBe("F7");
    expect(columnLabel(26)).toBe("AA");
  });
});

describe("distribution (port de Brlok)", () => {
  it("reproduit les formules desktop", () => {
    expect(distributionLevels("uniforme", 3, 3)).toEqual([3, 3, 3]);
    expect(distributionLevels("progressive", 5, 3)).toEqual([2, 2, 3, 4, 4]);
    expect(distributionLevels("pyramide", 5, 3)).toEqual([2, 3, 4, 3, 2]);
    expect(distributionLevels("crux", 5, 3)).toEqual([3, 3, 4, 3, 3]);
    expect(distributionLevels("alternance", 4, 3)).toEqual([2, 4, 2, 4]);
  });
  it("monte jusqu'au niveau 6", () => {
    expect(distributionLevels("crux", 3, 6)).toEqual([6, 6, 6]);
    expect(distributionLevels("progressive", 3, 6)).toEqual([5, 6, 6]);
  });
});

describe("cote estimée des blocs (§7.3)", () => {
  it("vaut 200 points par niveau, centrée sur 3,5", () => {
    expect(estimateBlockRating([1, 1, 1, 1, 1, 1])).toBe(1000);
    expect(estimateBlockRating([6, 6, 6, 6, 6, 6])).toBe(2000);
    expect(ratingToLevel(1500)).toBe(3.5);
  });
  it("valorise le crux et la longueur", () => {
    expect(estimateBlockRating([3, 3, 3, 3, 3, 5])).toBeGreaterThan(estimateBlockRating([3, 3, 3, 3, 3, 3]));
    expect(estimateBlockRating(Array(8).fill(3))).toBeGreaterThan(estimateBlockRating(Array(6).fill(3)));
  });
});

describe("Glicko-2", () => {
  it("reproduit l'exemple de Glickman", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const updated = updateRating(player, [
      { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
    ]);
    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.rd).toBeCloseTo(151.52, 1);
    expect(updated.volatility).toBeCloseTo(0.05999, 4);
  });
  it("fait monter le grimpeur et baisser le bloc après une réussite", () => {
    const { climber, block } = recordAttempt(newRating(1500), newRating(1500), true);
    expect(climber.rating).toBeGreaterThan(1500);
    expect(block.rating).toBeLessThan(1500);
  });
});

describe("import Brlok", () => {
  it("importe le catalogue réel et fusionne la grille pieds en gardant le niveau max", () => {
    const [{ wall, footMerges }] = importBrlok(brlokData, { footRowOffset: 0 });
    expect(wall.rows).toBe(7);
    expect(wall.cols).toBe(6);
    expect(footMerges.length).toBeGreaterThan(0);
    for (const merge of footMerges) {
      const hold = wall.holds.find((h) => h.id === merge.holdId)!;
      expect(hold.tags).toContain(merge.spec);
      if (merge.previousLevel !== null) expect(hold.level).toBeGreaterThanOrEqual(merge.previousLevel);
    }
  });
  it("peut ne pas fusionner la grille pieds", () => {
    const [{ footMerges }] = importBrlok(brlokData, { footRowOffset: null });
    expect(footMerges).toEqual([]);
  });
  it("ramène le niveau 6 à 5 pour Brlok desktop", () => {
    const wall = fullWall(() => 6);
    const { data, clamped } = exportBrlok([wall]);
    expect(data.catalogs[0].catalog.holds.every((h) => h.level === 5)).toBe(true);
    expect(clamped.length).toBe(42);
  });
});

describe("générateur classique", () => {
  it("respecte la plage de niveaux et ne répète pas une prise dans un bloc", () => {
    const wall = fullWall((r, c) => ((r + c) % 6) + 1);
    const blocks = generateClassicSession(wall, { targetLevel: 3, blocksCount: 4, holdsPerBlock: 6, rng: seededRng(1) });
    expect(blocks).toHaveLength(4);
    for (const b of blocks) {
      expect(new Set(b.holds.map((h) => h.id)).size).toBe(b.holds.length);
      expect(b.holds.every((h) => h.level >= 2 && h.level <= 4)).toBe(true);
    }
  });
});

describe("blocs-défis Chesscalade", () => {
  const wall = fullWall((r, c) => ((r * 2 + c) % 6) + 1);

  for (const { id } of PIECES) {
    it(`génère un bloc ${id} à portée et conforme à la pièce`, () => {
      const block = generateChessBlock(wall, { piece: id, targetRating: 1500, length: 6, rng: seededRng(42) });
      expect(block).not.toBeNull();
      const holds = block!.holds;
      for (let i = 1; i < holds.length; i++) {
        expect(distance(holds[i - 1].position, holds[i].position)).toBeLessThanOrEqual(wall.reach);
      }
      if (block!.relaxations.every((r) => !r.includes("forme"))) {
        expect(pathFits(wall, id, holds)).toBe(true);
      }
    });
  }

  it("place le crux en dernier pour une prise", () => {
    const block = generateChessBlock(wall, { piece: "cavalier", targetRating: 1400, length: 5, cruxLast: true, rng: seededRng(7) });
    const levels = block!.holds.map((h) => h.level);
    expect(levels[levels.length - 1]).toBe(Math.max(...levels));
  });

  it("vise la cote demandée", () => {
    const easy = generateChessBlock(wall, { piece: null, targetRating: 1100, length: 6, rng: seededRng(3) })!;
    const hard = generateChessBlock(wall, { piece: null, targetRating: 1900, length: 6, rng: seededRng(3) })!;
    expect(hard.estimatedRating).toBeGreaterThan(easy.estimatedRating);
  });

  it("assouplit les contraintes quand le mur est trop pauvre", () => {
    const sparse = fullWall(() => 1);
    sparse.holds = sparse.holds.filter((h) => h.position.col === 0);
    const block = generateChessBlock(sparse, { piece: "fou", targetRating: 1500, length: 6, rng: seededRng(5) });
    expect(block).not.toBeNull();
    expect(block!.relaxations.length).toBeGreaterThan(0);
  });
});
