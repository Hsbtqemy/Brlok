/**
 * Stockage partagé : quand l'app tourne comme page claude.ai avec la capacité `db`, joueurs, cotes,
 * journal et pans sont enregistrés avec la page (tous les appareils voient les mêmes données).
 * Ailleurs (npm run dev, fichier local), l'app reste sur le stockage du navigateur.
 *
 * Organisation des documents :
 *   players/<id>                 un joueur
 *   blocks/<clé>                 cote d'un bloc
 *   walls/<id>                   un pan
 *   journal/attempts-AAAA-MM     tentatives du mois (regroupées : pas un document par tentative)
 *   journal/games                parties
 *   meta/init                    marque la première mise en commun (reprise des données locales)
 */
import type { Rating } from "../core/glicko2";
import type { AttemptRecord, GameRecord, Player, RatingsState } from "../core/players";
import type { Wall } from "../core/wall";

type Body = Record<string, unknown>;
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Body | undefined;
}
interface QuerySnap {
  docs: DocSnap[];
  metadata: { fromCache: boolean };
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Body): Promise<void>;
  delete(): Promise<void>;
}
interface CollectionRef {
  doc(id: string): DocRef;
  onSnapshot(next: (snap: QuerySnap) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollectionRef;
}

export type SyncStatus = "local" | "connexion" | "partage" | "erreur";

const COLLECTIONS = ["players", "blocks", "walls", "journal"] as const;
type CollectionName = (typeof COLLECTIONS)[number];

const MONTH_LIMIT = 1000;
const GAMES_LIMIT = 300;

/** Identifiant de document valide (lettres, chiffres et `_ - . ~ : @ +`). */
export function safeId(value: string): string {
  const id = value.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 190);
  return id === "." || id === ".." || id === "" ? `_${id}` : id;
}

function month(iso: string): string {
  return iso.slice(0, 7);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const attemptId = (a: AttemptRecord) => `${a.at}|${a.playerId}|${a.holds.join("-")}`;

interface Handlers {
  onRatings(state: RatingsState): void;
  onWalls(walls: Wall[]): void;
  onStatus(status: SyncStatus, detail?: string): void;
}

export class SharedStore {
  private db: Db | null = null;
  private ready = false;
  private loaded = new Set<CollectionName>();
  private queues = new Map<string, Promise<unknown>>();

  // Copie des documents distants.
  private players = new Map<string, Player>();
  private blocks = new Map<string, Rating>();
  private walls = new Map<string, Wall>();
  private months = new Map<string, AttemptRecord[]>();
  private games: GameRecord[] = [];

  constructor(private readonly handlers: Handlers) {}

  get shared(): boolean {
    return this.db !== null;
  }

  /** Se connecte au stockage partagé s'il existe ; sinon reste en local. */
  async connect(local: { ratings: () => RatingsState; walls: () => Wall[] }): Promise<void> {
    const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    if (typeof claude?.use !== "function") {
      this.handlers.onStatus("local");
      return;
    }
    this.handlers.onStatus("connexion");
    const db = (await claude.use("db").catch(() => null)) as Db | null;
    if (!db) {
      this.handlers.onStatus("local");
      return;
    }
    this.db = db;
    for (const name of COLLECTIONS) {
      db.collection(name).onSnapshot(
        (snap) => this.onSnapshot(name, snap, local),
        (e) => this.handlers.onStatus("erreur", e.message),
      );
    }
  }

  private onSnapshot(name: CollectionName, snap: QuerySnap, local: { ratings: () => RatingsState; walls: () => Wall[] }) {
    const docs = snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, body: d.data() ?? {} }));
    switch (name) {
      case "players":
        this.players = new Map(docs.map((d) => [d.id, d.body as unknown as Player]));
        break;
      case "blocks":
        this.blocks = new Map(docs.map((d) => [String(d.body.key ?? d.id), d.body.rating as Rating]));
        break;
      case "walls":
        this.walls = new Map(docs.map((d) => [d.id, d.body as unknown as Wall]));
        break;
      case "journal":
        this.months = new Map(
          docs.filter((d) => d.id.startsWith("attempts-")).map((d) => [d.id.slice("attempts-".length), (d.body.items as AttemptRecord[]) ?? []]),
        );
        this.games = (docs.find((d) => d.id === "games")?.body.items as GameRecord[]) ?? [];
        break;
    }
    if (!snap.metadata.fromCache) this.loaded.add(name);

    if (this.ready) {
      this.emit(name);
    } else if (this.loaded.size === COLLECTIONS.length) {
      void this.start(local);
    }
  }

  /** Première connexion complète : reprise des données locales si le stockage partagé est neuf. */
  private async start(local: { ratings: () => RatingsState; walls: () => Wall[] }) {
    if (this.ready || !this.db) return;
    this.ready = true;
    try {
      const init = await this.db.doc("meta/init").get();
      const remoteEmpty = this.players.size === 0 && this.walls.size === 0 && this.blocks.size === 0;
      if (!init.exists && remoteEmpty) {
        const ratings = local.ratings();
        const walls = local.walls();
        if (ratings.players.length > 0 || walls.length > 0 || ratings.attempts.length > 0) {
          await this.syncRatings({ players: [], blocks: {}, attempts: [], games: [] }, ratings);
          await this.syncWalls([], walls);
        }
      }
      if (!init.exists) await this.write("meta/init", { at: new Date().toISOString() });
      // Le stockage partagé fait foi.
      this.emit("players");
      this.emit("walls");
      this.handlers.onStatus("partage");
    } catch (e) {
      this.handlers.onStatus("erreur", e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    }
  }

  private emit(name: CollectionName) {
    if (name === "walls") {
      this.handlers.onWalls([...this.walls.values()].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    const attempts = [...this.months.values()].flat().sort((a, b) => b.at.localeCompare(a.at));
    this.handlers.onRatings({
      players: [...this.players.values()].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name)),
      blocks: Object.fromEntries(this.blocks),
      attempts,
      games: this.games,
    });
  }

  /** Écritures une par une pour un même document (règle du stockage). */
  private write(path: string, data: Body | null): Promise<void> {
    const db = this.db;
    if (!db) return Promise.resolve();
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => (data === null ? db.doc(path).delete() : db.doc(path).set(data)))
      .catch((e: { code?: string; message?: string }) => {
        this.handlers.onStatus("erreur", e?.message ?? String(e));
      });
    this.queues.set(path, next);
    return next;
  }

  /** Envoie au stockage partagé ce qui a changé entre deux états. */
  async syncRatings(prev: RatingsState, next: RatingsState): Promise<void> {
    if (!this.db) return;
    const writes: Promise<void>[] = [];

    const prevPlayers = new Map(prev.players.map((p) => [p.id, p]));
    for (const p of next.players) {
      if (!same(prevPlayers.get(p.id), p)) writes.push(this.write(`players/${safeId(p.id)}`, p as unknown as Body));
      prevPlayers.delete(p.id);
    }
    for (const id of prevPlayers.keys()) writes.push(this.write(`players/${safeId(id)}`, null));

    for (const [key, rating] of Object.entries(next.blocks)) {
      if (!same(prev.blocks[key], rating)) writes.push(this.write(`blocks/${safeId(key)}`, { key, rating }));
    }

    const known = new Set(prev.attempts.map(attemptId));
    const fresh = next.attempts.filter((a) => !known.has(attemptId(a)));
    const byMonth = new Map<string, AttemptRecord[]>();
    for (const a of fresh) byMonth.set(month(a.at), [...(byMonth.get(month(a.at)) ?? []), a]);
    for (const [m, records] of byMonth) {
      const existing = this.months.get(m) ?? [];
      const ids = new Set(existing.map(attemptId));
      const items = [...records.filter((a) => !ids.has(attemptId(a))), ...existing].slice(0, MONTH_LIMIT);
      this.months.set(m, items);
      writes.push(this.write(`journal/attempts-${m}`, { items }));
    }

    if (!same(prev.games, next.games)) {
      this.games = next.games.slice(0, GAMES_LIMIT);
      writes.push(this.write("journal/games", { items: this.games }));
    }
    await Promise.all(writes);
  }

  async syncWalls(prev: Wall[], next: Wall[]): Promise<void> {
    if (!this.db) return;
    const before = new Map(prev.map((w) => [w.id, w]));
    const writes: Promise<void>[] = [];
    for (const w of next) {
      if (!same(before.get(w.id), w)) writes.push(this.write(`walls/${safeId(w.id)}`, w as unknown as Body));
      before.delete(w.id);
    }
    for (const id of before.keys()) writes.push(this.write(`walls/${safeId(id)}`, null));
    await Promise.all(writes);
  }
}
