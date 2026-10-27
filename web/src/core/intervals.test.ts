import { describe, expect, it } from "vitest";
import { formatClock, planIntervals, timerState, totalSeconds, workRest } from "./intervals";

describe("minuteur (port de Brlok desktop)", () => {
  it("40/20 × 3 : travail, repos, travail, repos, travail", () => {
    const plan = planIntervals({ mode: "fixe", workS: 40, restS: 20, rounds: 3 });
    expect(plan.map((i) => `${i.phase[0]}${i.seconds}`)).toEqual(["t40", "r20", "t40", "r20", "t40"]);
    expect(totalSeconds(plan)).toBe(160);
  });

  it("pyramide : travail du min au max, repos = moitié", () => {
    const cfg = { mode: "pyramide" as const, workS: 40, restS: 20, rounds: 5, workMinS: 20, workMaxS: 60 };
    expect([1, 2, 3, 4, 5].map((r) => workRest(cfg, r))).toEqual([
      { work: 20, rest: 10 },
      { work: 30, rest: 15 },
      { work: 40, rest: 20 },
      { work: 50, rest: 25 },
      { work: 60, rest: 30 },
    ]);
  });

  it("EMOM : une minute par round, travail plafonné à 55 s", () => {
    expect(workRest({ mode: "emom", workS: 40, restS: 0, rounds: 6 }, 1)).toEqual({ work: 40, rest: 20 });
    expect(workRest({ mode: "emom", workS: 70, restS: 0, rounds: 6 }, 1)).toEqual({ work: 55, rest: 5 });
  });

  it("état à un instant donné, et fin du minuteur", () => {
    const plan = planIntervals({ mode: "fixe", workS: 40, restS: 20, rounds: 2 });
    expect(timerState(plan, 10_000)).toMatchObject({ index: 0, remainingMs: 30_000, finished: false });
    expect(timerState(plan, 45_000)).toMatchObject({ index: 1, remainingMs: 15_000 });
    expect(timerState(plan, 45_000).interval?.phase).toBe("repos");
    expect(timerState(plan, 100_000).finished).toBe(true);
    expect(formatClock(61_500)).toBe("01:02");
  });

  it("chrono : pas de plan, le temps monte", () => {
    const plan = planIntervals({ mode: "chrono", workS: 0, restS: 0, rounds: 1 });
    expect(timerState(plan, 12_345)).toMatchObject({ index: -1, remainingMs: 12_345, finished: false });
  });
});
