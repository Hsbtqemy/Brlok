import { describe, expect, it } from "vitest";
import { countByColor, detectBlobs } from "./colorDetect";

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
