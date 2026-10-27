import { describe, expect, it } from "vitest";
import { makeChallengeBlock } from "./challenge";
import { gradeToRating, pickRoute, routeLabel } from "./gym";
import { createPlayer, emptyRatingsState, recordBlockAttempt, routeKey } from "./players";
import { seededRng } from "./random";
import { createEmptyWall, type Route, type Wall } from "./wall";

function gym(routes: Partial<Route>[]): Wall {
  return {
    ...createEmptyWall("salle", "Salle", 0, 0),
    kind: "voies",
    routes: routes.map((r, i) => ({ id: `v${i}`, name: "", color: "vert", grade: "6a", styles: [], ...r })),
  };
}

describe("mode salle", () => {
  it("convertit les cotations Font", () => {
    expect(gradeToRating("5c")).toBe(1300);
    expect(gradeToRating("6A+")).toBe(1450);
    expect(gradeToRating("?")).toBe(1500);
  });

  it("choisit la voie la plus proche de la cote visée, en préférant le style de la pièce", () => {
    const wall = gym([
      { grade: "5c", styles: ["dalle"] },
      { grade: "6b", styles: ["dynamique"] },
      { grade: "6b", styles: ["dalle"], color: "jaune" },
      { grade: "7a", styles: ["dynamique"], archived: true },
    ]);
    const b = pickRoute(wall, { piece: "cavalier", targetRating: 1500, rng: seededRng(1) })!;
    expect(b.route?.id).toBe("v1");
    expect(b.estimatedRating).toBe(1500);
    expect(b.relaxations).toEqual([]);
    const pion = pickRoute(wall, { piece: "pion", targetRating: 1500, rng: seededRng(1) })!;
    expect(pion.route?.label).toBe("jaune 6b");
    // La voie démontée n'est jamais proposée.
    const hard = pickRoute(wall, { piece: "cavalier", targetRating: 1900, rng: seededRng(1) })!;
    expect(hard.route?.id).toBe("v1");
  });

  it("respecte un budget (bloc imposé), utilise la cote apprise et passe par le point d'entrée commun", () => {
    const wall = gym([{ grade: "6a" }, { grade: "6c" }]);
    const b = makeChallengeBlock(wall, { piece: null, targetRating: 1700, length: 6, maxRating: 1500, rng: seededRng(2) })!;
    expect(b.route?.id).toBe("v0");
    const learned = makeChallengeBlock(wall, {
      piece: null,
      targetRating: 1700,
      length: 6,
      // La 6c s'est révélée bien plus dure que sa cotation : la 6a (1400) devient la plus proche de 1700.
      routeRating: (r) => (r.id === "v1" ? 2100 : undefined),
      rng: seededRng(2),
    })!;
    expect(learned.route?.id).toBe("v0");
    expect(learned.estimatedRating).toBe(1400);
  });

  it("une voie a sa propre cote et s'inscrit au journal par son nom", () => {
    const wall = gym([{ grade: "6a", name: "Le toit", color: "rouge" }]);
    const block = pickRoute(wall, { piece: null, targetRating: 1400, rng: seededRng(3) })!;
    expect(routeLabel(wall.routes[0])).toBe("Le toit (rouge 6a)");
    let state = createPlayer(emptyRatingsState(), "Alice", "a");
    state = recordBlockAttempt(state, "a", "salle", block, true, "libre").state;
    expect(Object.keys(state.blocks)).toEqual([routeKey("salle", "v0")]);
    expect(state.attempts[0].holds).toEqual(["Le toit (rouge 6a)"]);
  });

  it("sans voie en place : pas de bloc", () => {
    expect(pickRoute(gym([{ archived: true }]), { piece: null, targetRating: 1500, rng: seededRng(1) })).toBeNull();
  });
});
