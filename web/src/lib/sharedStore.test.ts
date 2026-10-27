import { describe, expect, it } from "vitest";
import { createPlayer, emptyRatingsState, recordBlockAttempt, type RatingsState } from "../core/players";
import type { Wall } from "../core/wall";
import { safeId, SharedStore, type SyncStatus } from "./sharedStore";

/** Faux stockage en mémoire : mêmes appels que la capacité `db` (sous-ensemble utilisé). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, ((snap: unknown) => void)[]>();
  const snapOf = (collection: string) => ({
    docs: [...docs.entries()]
      .filter(([p]) => p.split("/")[0] === collection)
      .map(([p, body]) => ({ id: p.split("/")[1], exists: true, data: () => body })),
    metadata: { fromCache: false },
  });
  const notify = (path: string) => {
    const c = path.split("/")[0];
    for (const l of listeners.get(c) ?? []) l(snapOf(c));
  };
  const doc = (path: string) => ({
    get: async () => ({ id: path, exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>) => {
      docs.set(path, JSON.parse(JSON.stringify(data)));
      notify(path);
    },
    delete: async () => {
      docs.delete(path);
      notify(path);
    },
  });
  return {
    docs,
    db: {
      doc,
      collection: (c: string) => ({
        doc: (id: string) => doc(`${c}/${id}`),
        onSnapshot: (next: (snap: unknown) => void) => {
          listeners.set(c, [...(listeners.get(c) ?? []), next]);
          queueMicrotask(() => next(snapOf(c)));
          return () => {};
        },
      }),
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

function setup(db: unknown) {
  (globalThis as unknown as { window: unknown }).window = { claude: { use: async () => db } };
  const seen = { ratings: null as RatingsState | null, walls: null as Wall[] | null, status: [] as SyncStatus[] };
  const store = new SharedStore({
    onRatings: (r) => (seen.ratings = r),
    onWalls: (w) => (seen.walls = w),
    onStatus: (s) => seen.status.push(s),
    onLiveGame: () => {},
  });
  return { store, seen };
}

const wall: Wall = { id: "default", name: "Pan principal", kind: "pan", rows: 7, cols: 6, bottom: "last", holds: [], routes: [], reach: 2, forbiddenLinks: [] };
const block = {
  holds: ["A1", "B2"].map((id, i) => ({ id, level: 3, tags: [], position: { row: i, col: i }, active: true })),
  estimatedRating: 1400,
  relaxations: [],
};

describe("stockage partagé", () => {
  it("reprend les données locales quand le stockage partagé est neuf", async () => {
    const fake = fakeDb();
    const { store, seen } = setup(fake.db);
    let local = createPlayer(emptyRatingsState(), "Alice", "a");
    local = recordBlockAttempt(local, "a", "default", block, true, "libre", "2026-10-27T10:00:00.000Z").state;
    await store.connect({ ratings: () => local, walls: () => [wall] });
    await tick();
    expect(seen.status.at(-1)).toBe("partage");
    expect(fake.docs.has("players/a")).toBe(true);
    expect(fake.docs.has("walls/default")).toBe(true);
    expect(fake.docs.has(`blocks/${safeId("default:A1-B2")}`)).toBe(true);
    expect((fake.docs.get("journal/attempts-2026-10")!.items as unknown[]).length).toBe(1);
    expect(seen.ratings?.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(seen.ratings?.attempts).toHaveLength(1);
    expect(seen.walls?.map((w) => w.id)).toEqual(["default"]);
  });

  it("ne réimporte pas les données locales d'un autre appareil une fois le stockage initialisé", async () => {
    const fake = fakeDb();
    fake.docs.set("meta/init", { at: "x" });
    const { store, seen } = setup(fake.db);
    const local = createPlayer(emptyRatingsState(), "Bruno", "b");
    await store.connect({ ratings: () => local, walls: () => [] });
    await tick();
    expect(fake.docs.has("players/b")).toBe(false);
    expect(seen.ratings?.players).toEqual([]);
  });

  it("envoie seulement ce qui change et suit les suppressions", async () => {
    const fake = fakeDb();
    const { store, seen } = setup(fake.db);
    await store.connect({ ratings: () => emptyRatingsState(), walls: () => [] });
    await tick();
    const s1 = createPlayer(createPlayer(emptyRatingsState(), "Alice", "a"), "Bruno", "b");
    await store.syncRatings(emptyRatingsState(), s1);
    const s2 = recordBlockAttempt(s1, "a", "default", block, false, "partie", "2026-11-02T09:00:00.000Z").state;
    await store.syncRatings(s1, s2);
    const s3 = { ...s2, players: s2.players.filter((p) => p.id !== "b") };
    await store.syncRatings(s2, s3);
    await tick();
    expect([...fake.docs.keys()].filter((k) => k.startsWith("players/"))).toEqual(["players/a"]);
    expect(fake.docs.has("journal/attempts-2026-11")).toBe(true);
    expect(seen.ratings?.players.map((p) => p.id)).toEqual(["a"]);
    expect(seen.ratings?.attempts[0].context).toBe("partie");
  });

  it("reste en local hors page claude.ai", async () => {
    (globalThis as unknown as { window: unknown }).window = {};
    const seen: SyncStatus[] = [];
    const store = new SharedStore({ onRatings: () => {}, onWalls: () => {}, onStatus: (s) => seen.push(s), onLiveGame: () => {} });
    await store.connect({ ratings: emptyRatingsState, walls: () => [] });
    expect(seen).toEqual(["local"]);
    expect(store.shared).toBe(false);
  });
});
