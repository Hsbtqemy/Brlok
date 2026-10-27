<script lang="ts">
  import exampleCatalog from "../../data/catalog_collection.json";
  import { exportBrlok, importBrlok, type FootMerge } from "./core/brlokImport";
  import { DISTRIBUTION_PATTERNS, type DistributionPattern } from "./core/distribution";
  import { generateChessBlock, generateClassicSession, type Block } from "./core/generator";
  import { PIECES, type Piece } from "./core/pieces";
  import { seededRng } from "./core/random";
  import { MAX_LEVEL, type Wall } from "./core/wall";
  import PanView from "./lib/PanView.svelte";
  import { loadActiveWallId, loadWalls, saveActiveWallId, saveWalls } from "./lib/storage";

  const LEVEL_PROFILES = [
    { label: "Très facile", level: 1 },
    { label: "Facile", level: 2 },
    { label: "Modéré", level: 3 },
    { label: "Difficile", level: 4 },
    { label: "Très difficile", level: 5 },
    { label: "Extrême", level: 6 },
  ];

  let walls = $state<Wall[]>(loadWalls());
  let activeId = $state<string | null>(loadActiveWallId());
  const wall = $derived(walls.find((w) => w.id === activeId) ?? walls[0]);

  let footRowOffset = $state<number | null>(0);
  let footMerges = $state<FootMerge[]>([]);
  let message = $state("");

  let mode = $state<"chesscalade" | "classique">("chesscalade");

  // Chesscalade
  let piece = $state<Piece>("cavalier");
  let targetRating = $state(1500);
  let length = $state(6);
  let cruxLast = $state(false);
  let chessBlock = $state<Block | null>(null);
  let generationFailed = $state(false);
  const usage = new Map<string, number>();

  // Brlok classique
  let classicLevel = $state(3);
  let classicHolds = $state(8);
  let classicBlocks = $state(5);
  let classicPattern = $state<DistributionPattern>("uniforme");
  let classicVariety = $state(true);
  let classicSession = $state<Block[]>([]);
  let classicSelected = $state(0);

  const sequence = $derived(
    mode === "chesscalade" ? (chessBlock?.holds.map((h) => h.id) ?? []) : (classicSession[classicSelected]?.holds.map((h) => h.id) ?? []),
  );

  function persist() {
    saveWalls(walls);
    if (wall) saveActiveWallId(wall.id);
  }

  function loadData(data: unknown, source: string) {
    try {
      const imported = importBrlok(data, { footRowOffset });
      const ids = new Set(imported.map((i) => i.wall.id));
      walls = [...walls.filter((w) => !ids.has(w.id)), ...imported.map((i) => i.wall)];
      activeId = imported[0]?.wall.id ?? activeId;
      footMerges = imported.flatMap((i) => i.footMerges);
      chessBlock = null;
      classicSession = [];
      message = `${imported.length} pan(s) importé(s) depuis ${source}.`;
      persist();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
  }

  async function onFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      loadData(JSON.parse(await file.text()), file.name);
    } catch {
      message = "Fichier JSON illisible.";
    }
  }

  function exportFile() {
    const { data, clamped } = exportBrlok(walls, wall?.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "catalog_collection.json";
    a.click();
    URL.revokeObjectURL(a.href);
    message = clamped.length
      ? `Exporté. Brlok desktop limite les mains au niveau 5 : ${clamped.length} prise(s) de niveau 6 ramenée(s) à 5.`
      : "Exporté au format Brlok desktop.";
  }

  function updateWall(patch: Partial<Wall>) {
    if (!wall) return;
    const id = wall.id;
    walls = walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
    persist();
  }

  function generateChess() {
    if (!wall) return;
    chessBlock = generateChessBlock(wall, { piece, targetRating, length, cruxLast, usage, rng: seededRng(Date.now()) });
    generationFailed = chessBlock === null;
  }

  function generateClassic() {
    if (!wall) return;
    classicSession = generateClassicSession(wall, {
      targetLevel: classicLevel,
      blocksCount: classicBlocks,
      holdsPerBlock: classicHolds,
      pattern: classicPattern,
      variety: classicVariety,
      rng: seededRng(Date.now()),
    });
    classicSelected = 0;
  }
</script>

<header>
  <h1>Brlok <span>·</span> Chesscalade</h1>
  <p class="subtitle">Version web — prototype</p>
</header>

<main>
  <section class="panel wall-panel">
    <h2>Pan</h2>
    <div class="row">
      <label class="file">
        <input type="file" accept="application/json,.json" onchange={onFile} />
        <span>Importer un catalogue Brlok…</span>
      </label>
      <button onclick={() => loadData(exampleCatalog, "l'exemple du dépôt")}>Charger l'exemple</button>
    </div>
    <label class="field">
      Grille pieds fusionnée à partir de la rangée
      <select bind:value={footRowOffset}>
        <option value={null}>ne pas fusionner</option>
        {#each Array.from({ length: wall?.rows ?? 7 }, (_, i) => i) as r (r)}
          <option value={r}>{r + 1}</option>
        {/each}
      </select>
    </label>
    <p class="hint">S'applique au prochain import. Les types de prises deviennent des étiquettes, le niveau le plus haut est gardé.</p>

    {#if walls.length > 0 && wall}
      <label class="field">
        Pan actif
        <select
          value={wall.id}
          onchange={(e) => {
            activeId = (e.currentTarget as HTMLSelectElement).value;
            chessBlock = null;
            classicSession = [];
            persist();
          }}
        >
          {#each walls as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
        </select>
      </label>
      <label class="field">
        Bas du mur
        <select value={wall.bottom} onchange={(e) => updateWall({ bottom: (e.currentTarget as HTMLSelectElement).value as Wall["bottom"] })}>
          <option value="last">rangée {wall.rows} (comme Brlok desktop)</option>
          <option value="first">rangée 1</option>
        </select>
      </label>
      <label class="field">
        Portée entre deux prises (cases)
        <input type="number" min="1" max="4" value={wall.reach} onchange={(e) => updateWall({ reach: Number((e.currentTarget as HTMLInputElement).value) })} />
      </label>
      <button onclick={exportFile}>Exporter pour Brlok desktop</button>
    {/if}

    {#if message}<p class="message">{message}</p>{/if}
    {#if footMerges.length > 0}
      <details>
        <summary>{footMerges.length} prise(s) enrichie(s) par la grille pieds</summary>
        <ul class="merges">
          {#each footMerges as m (m.holdId + m.spec)}
            <li>
              <strong>{m.holdId}</strong> ← « {m.spec} »
              {#if m.previousLevel === null}(nouvelle prise, niveau {m.level}){:else if m.previousLevel !== m.level}(niveau {m.previousLevel} → {m.level}){/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>

  <section class="panel pan-panel">
    {#if wall}
      <PanView {wall} {sequence} />
    {:else}
      <p class="empty">Importe ton <code>catalog_collection.json</code> de Brlok, ou charge l'exemple.</p>
    {/if}
  </section>

  <section class="panel gen-panel">
    <div class="tabs">
      <button aria-pressed={mode === "chesscalade"} onclick={() => (mode = "chesscalade")}>Chesscalade</button>
      <button aria-pressed={mode === "classique"} onclick={() => (mode = "classique")}>Brlok classique</button>
    </div>

    {#if mode === "chesscalade"}
      <h2>Bloc-défi</h2>
      <div class="pieces">
        {#each PIECES as p (p.id)}
          <button aria-pressed={piece === p.id} onclick={() => (piece = p.id)} title={p.character}>
            <span class="symbol">{p.symbol}</span>{p.label}
          </button>
        {/each}
      </div>
      <p class="hint">{PIECES.find((p) => p.id === piece)?.character}</p>
      <label class="field">
        Cote visée : <strong>{targetRating}</strong>
        <input type="range" min="800" max="2300" step="50" bind:value={targetRating} />
      </label>
      <label class="field">
        Nombre de prises
        <input type="number" min="3" max="12" bind:value={length} />
      </label>
      <label class="check"><input type="checkbox" bind:checked={cruxLast} /> Crux en dernier (prise d'une pièce)</label>
      <button class="primary" disabled={!wall} onclick={generateChess}>Générer</button>

      {#if chessBlock}
        <div class="result">
          <p class="sequence">{chessBlock.holds.map((h) => h.id).join(" → ")}</p>
          <p>Cote estimée : <strong>{chessBlock.estimatedRating}</strong></p>
          {#if chessBlock.relaxations.length > 0}
            <p class="warn">Assoupli : {chessBlock.relaxations.join(", ")}.</p>
          {/if}
        </div>
      {:else if generationFailed}
        <p class="warn">Aucun bloc possible sur ce pan.</p>
      {/if}
    {:else}
      <h2>Séance</h2>
      <label class="field">
        Difficulté
        <select bind:value={classicLevel}>
          {#each LEVEL_PROFILES.filter((p) => p.level <= MAX_LEVEL) as p (p.level)}<option value={p.level}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        Répartition
        <select bind:value={classicPattern}>
          {#each DISTRIBUTION_PATTERNS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">Blocs <input type="number" min="1" max="20" bind:value={classicBlocks} /></label>
      <label class="field">Prises par bloc <input type="number" min="1" max="20" bind:value={classicHolds} /></label>
      <label class="check"><input type="checkbox" bind:checked={classicVariety} /> Variété</label>
      <button class="primary" disabled={!wall} onclick={generateClassic}>Générer la séance</button>

      {#if classicSession.length > 0}
        <ol class="blocks">
          {#each classicSession as b, i (i)}
            <li>
              <button aria-pressed={classicSelected === i} onclick={() => (classicSelected = i)}>
                Bloc {i + 1} · {b.estimatedRating}
              </button>
            </li>
          {/each}
        </ol>
        <p class="sequence">{classicSession[classicSelected]?.holds.map((h) => h.id).join(" → ")}</p>
      {/if}
    {/if}
  </section>
</main>

<style>
  header {
    padding: 16px;
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
  }
  h1 span {
    color: var(--accent);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }
  .subtitle {
    margin: 4px 0 0;
    color: var(--muted);
  }
  main {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(280px, 1fr) minmax(260px, 340px);
    gap: 16px;
    padding: 0 16px 24px;
    align-items: start;
  }
  @media (max-width: 960px) {
    main {
      grid-template-columns: 1fr;
    }
    .pan-panel {
      order: -1;
    }
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .file {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid var(--accent);
    color: var(--accent);
    cursor: pointer;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.9rem;
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
  .warn {
    color: var(--warn);
    margin: 0;
  }
  .merges {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 0.85rem;
  }
  .tabs {
    display: flex;
    gap: 8px;
  }
  .tabs button {
    flex: 1;
  }
  .pieces {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .pieces button {
    padding: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.8rem;
    min-height: 56px;
  }
  .symbol {
    font-size: 1.5rem;
    line-height: 1;
  }
  .result {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .result p {
    margin: 4px 0;
  }
  .sequence {
    font-weight: 600;
    word-break: break-word;
  }
  .blocks {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }
  .blocks button {
    width: 100%;
  }
  .empty {
    text-align: center;
    color: var(--muted);
  }
  input[type="range"] {
    width: 100%;
  }
</style>
