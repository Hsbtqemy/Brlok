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

describe("Brlok en salle", () => {
  const wall = gym([
    { grade: "5a" },
    { grade: "5c" },
    { grade: "6a" },
    { grade: "6b" },
    { grade: "6c" },
    { grade: "7a" },
  ]);

  it("séance en pyramide autour de la cible, sans répéter une voie", async () => {
    const { routeSession } = await import("./gym");
    const session = routeSession(wall, { targetRating: 1500, count: 5, pattern: "pyramide", step: 200, rng: seededRng(4) });
    // Cibles 1300, 1500, 1700, 1500, 1300 : on monte puis on redescend, sans reprendre une voie.
    expect(session.map((b) => b.route?.grade)).toEqual(["5c", "6b", "6c", "6a", "5a"]);
    expect(new Set(session.map((b) => b.route?.id)).size).toBe(5);
  });

  it("plus de blocs que de voies : une voie revient, signalé", async () => {
    const { routeSession } = await import("./gym");
    const session = routeSession(gym([{ grade: "6a" }]), { targetRating: 1400, count: 2, rng: seededRng(1) });
    expect(session).toHaveLength(2);
    expect(session[1].relaxations.length).toBe(1);
  });

  it("carnet : tentatives, réussites et première réussite par voie", async () => {
    const { routeLogs } = await import("./gym");
    let state = createPlayer(emptyRatingsState(), "Alice", "a");
    const block = pickRoute(wall, { piece: null, targetRating: 1100, rng: seededRng(1) })!;
    state = recordBlockAttempt(state, "a", "salle", block, false, "libre", "2026-10-01T10:00:00Z").state;
    state = recordBlockAttempt(state, "a", "salle", block, true, "libre", "2026-10-02T10:00:00Z").state;
    state = recordBlockAttempt(state, "a", "salle", block, true, "libre", "2026-10-03T10:00:00Z").state;
    const logs = routeLogs(state.attempts, "a", "salle");
    expect(logs.get(block.route!.id)).toEqual({ attempts: 3, successes: 2, firstSuccessAt: "2026-10-02T10:00:00Z", lastAt: "2026-10-03T10:00:00Z" });
  });
});

describe("voies retenues pour une partie", () => {
  it("le choix se limite aux voies cochées", () => {
    const wall = gym([{ grade: "5c" }, { grade: "6a" }, { grade: "7a" }]);
    const b = pickRoute(wall, { piece: null, targetRating: 1400, allowed: ["v2"], rng: seededRng(1) })!;
    expect(b.route?.id).toBe("v2");
    // Une sélection vide ou périmée ne bloque pas le jeu : toutes les voies.
    expect(pickRoute(wall, { piece: null, targetRating: 1400, allowed: ["inconnue"], rng: seededRng(1) })?.route?.id).toBe("v1");
  });
});
