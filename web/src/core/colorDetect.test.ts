import { describe, expect, it } from "vitest";
import { countByColor, detectBlobs, findSimilar, inZone, nearestColorName, sampleColor, seedTolerance } from "./colorDetect";

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return data;
}

describe("détection par couleur", () => {
  it("trouve les taches de couleur vive sur un fond clair et écarte les grands aplats", () => {
    const W = 200, H = 100;
    const data = image(W, H, (x, y) => {
      if (x >= 10 && x < 20 && y >= 10 && y < 20) return [30, 80, 220]; // bleu
      if (x >= 50 && x < 58 && y >= 40 && y < 48) return [40, 160, 60]; // vert
      if (x >= 90 && x < 100 && y >= 70 && y < 80) return [30, 80, 220]; // bleu
      if (x >= 120) return [255, 110, 0]; // grand aplat orange (panneau peint) : ignoré
      return [235, 225, 205]; // bois clair
    });
    const blobs = detectBlobs(data, W, H);
    expect(countByColor(blobs)).toEqual([
      { color: "bleu", count: 2, hex: "#1e50dc" },
      { color: "vert", count: 1, hex: "#28a03c" },
    ]);
    const first = blobs.find((b) => b.color === "bleu")!;
    expect(first.x).toBeCloseTo(14.5 / W, 3);
    expect(first.w).toBeCloseTo(10 / W, 3);
  });
});

describe("pipette", () => {
  // Mur gris moyen, prises blanches et noires (que la détection automatique ignore), et un bac bleu.
  const W = 120, H = 80;
  const data = image(W, H, (x, y) => {
    if (x >= 10 && x < 18 && y >= 10 && y < 18) return [245, 243, 240]; // blanc
    if (x >= 60 && x < 66 && y >= 50 && y < 58) return [238, 238, 236]; // blanc (un peu plus terne)
    if (x >= 90 && x < 98 && y >= 20 && y < 28) return [25, 25, 28]; // noir
    if (x >= 30 && x < 38 && y >= 60 && y < 68) return [30, 80, 220]; // bleu
    return [150, 140, 125]; // mur
  });

  it("toucher une prise blanche retrouve toutes les blanches, et seulement elles", () => {
    const target = sampleColor(data, W, H, 14 / W, 14 / H);
    const blobs = findSimilar(data, W, H, target);
    expect(blobs).toHaveLength(2);
    expect(blobs.every((b) => b.color === "blanc")).toBe(true);
  });

  it("le noir aussi, et la teinte reçoit un nom", () => {
    const target = sampleColor(data, W, H, 94 / W, 24 / H);
    expect(nearestColorName(target)).toBe("noir");
    expect(findSimilar(data, W, H, target)).toHaveLength(1);
    expect(nearestColorName([30, 80, 220])).toBe("bleu");
    expect(nearestColorName([46, 160, 60])).toBe("vert");
  });

  it("le mur lui-même (trop grand) n'est jamais une prise", () => {
    const target = sampleColor(data, W, H, 0.5, 0.05);
    expect(findSimilar(data, W, H, target, 30)).toHaveLength(0);
  });

  it("une zone ne garde que les prises à l'intérieur", () => {
    const pts = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.7 }];
    expect(inZone(pts, { x0: 0.6, y0: 0.9, x1: 0.3, y1: 0.5 })).toEqual([{ x: 0.5, y: 0.7 }]);
  });
});

describe("pipette sur un mur clair", () => {
  it("resserre la tolérance pour détacher une prise blanche d'un mur presque blanc", () => {
    const W = 120, H = 80;
    const data = image(W, H, (x, y) => {
      if (x >= 10 && x < 18 && y >= 10 && y < 18) return [250, 250, 250]; // prise blanche
      if (x >= 70 && x < 78 && y >= 40 && y < 48) return [249, 249, 248]; // autre prise blanche
      return [225, 222, 238]; // mur lilas très clair
    });
    const target = sampleColor(data, W, H, 14 / W, 14 / H);
    expect(findSimilar(data, W, H, target, 24)).toHaveLength(0); // tout se fond dans le mur
    const tol = seedTolerance(data, W, H, 14 / W, 14 / H, target, 24)!;
    expect(tol).toBeLessThan(24);
    expect(findSimilar(data, W, H, target, tol)).toHaveLength(2);
  });
});
