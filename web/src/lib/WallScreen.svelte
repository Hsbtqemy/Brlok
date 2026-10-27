<script lang="ts">
  import exampleCatalog from "../../../data/catalog_collection.json";
  import { exportBrlok, importBrlok, type FootMerge } from "../core/brlokImport";
  import { DISTRIBUTION_PATTERNS, type DistributionPattern } from "../core/distribution";
  import { generateChessBlock, generateClassicSession, type Block } from "../core/generator";
  import { FOOT_RULES, type FootRule } from "../core/feet";
  import { PIECES, type Piece } from "../core/pieces";
  import { seededRng } from "../core/random";
  import type { Wall } from "../core/wall";
  import { app } from "./appState.svelte";
  import PanView from "./PanView.svelte";
  import WallEditor from "./WallEditor.svelte";

  let editing = $state(false);

  const LEVEL_PROFILES = [
    { label: "Très facile", level: 1 },
    { label: "Facile", level: 2 },
    { label: "Modéré", level: 3 },
    { label: "Difficile", level: 4 },
    { label: "Très difficile", level: 5 },
    { label: "Extrême", level: 6 },
  ];

  let footRowOffset = $state<number | null>(null);
  let footMerges = $state<FootMerge[]>([]);
  let message = $state("");

  let mode = $state<"chesscalade" | "classique">("chesscalade");

  // Chesscalade
  let piece = $state<Piece>("cavalier");
  let targetRating = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1500));
  let length = $state(6);
  let cruxLast = $state(false);
  let feet = $state<FootRule>("libres");
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

  /** Bloc affiché, et s'il a déjà été noté (une seule tentative enregistrée par bloc affiché). */
  const currentBlock = $derived(mode === "chesscalade" ? chessBlock : (classicSession[classicSelected] ?? null));
  let recorded = $state<string | null>(null);
  let lastDelta = $state<number | null>(null);
  const currentKey = $derived(currentBlock ? `${mode}:${classicSelected}:${currentBlock.holds.map((h) => h.id).join("-")}` : null);

  function loadData(data: unknown, source: string) {
    try {
      const imported = importBrlok(data, { footRowOffset });
      const ids = new Set(imported.map((i) => i.wall.id));
      app.setWalls([...app.walls.filter((w) => !ids.has(w.id)), ...imported.map((i) => i.wall)], imported[0]?.wall.id);
      footMerges = imported.flatMap((i) => i.footMerges);
      chessBlock = null;
      classicSession = [];
      message = `${imported.length} pan(s) importé(s) depuis ${source}.`;
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

  /** Copie du JSON exporté : repli quand le téléchargement est bloqué (page intégrée). */
  let exportJson = $state<string | null>(null);

  async function copyExport() {
    if (!exportJson) return;
    try {
      await navigator.clipboard.writeText(exportJson);
      message = "JSON copié : colle-le dans un fichier catalog_collection.json.";
    } catch {
      message = "Copie refusée : sélectionne le texte ci-dessous et copie-le à la main.";
    }
  }

  function exportFile() {
    const { data, clamped } = exportBrlok(app.walls, app.wall?.id);
    exportJson = JSON.stringify(data, null, 2);
    const blob = new Blob([exportJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "catalog_collection.json";
    a.click();
    URL.revokeObjectURL(a.href);
    message = clamped.length
      ? `Exporté. Brlok desktop limite les mains au niveau 5 : ${clamped.length} prise(s) de niveau 6 ramenée(s) à 5.`
      : "Exporté au format Brlok desktop.";
  }

  function generateChess() {
    if (!app.wall) return;
    chessBlock = generateChessBlock(app.wall, { piece, targetRating, length, cruxLast, feet, usage, rng: seededRng(Date.now()) });
    generationFailed = chessBlock === null;
    lastDelta = null;
  }

  function generateClassic() {
    if (!app.wall) return;
    classicSession = generateClassicSession(app.wall, {
      targetLevel: classicLevel,
      blocksCount: classicBlocks,
      holdsPerBlock: classicHolds,
      pattern: classicPattern,
      variety: classicVariety,
      rng: seededRng(Date.now()),
    });
    classicSelected = 0;
    lastDelta = null;
  }

  function record(success: boolean) {
    const player = app.activePlayer;
    if (!player || !currentBlock || !currentKey) return;
    lastDelta = app.recordAttempt(player.id, currentBlock, success, "libre");
    recorded = currentKey;
  }
</script>

<div class="screen">
  <section class="panel wall-panel">
    <h2>Pan</h2>
    <div class="row">
      <label class="file">
        <input type="file" accept="application/json,.json" onchange={onFile} />
        <span>Importer un catalogue Brlok…</span>
      </label>
      <button onclick={() => loadData(exampleCatalog, "l'exemple du dépôt")}>Charger l'exemple</button>
    </div>
    <details>
      <summary>Option d'import : « grille pieds » de Brlok desktop</summary>
      <label class="field">
        Fusionner la grille pieds dans le pan, à partir de la rangée
        <select bind:value={footRowOffset}>
          <option value={null}>ne pas fusionner (recommandé)</option>
          {#each Array.from({ length: app.wall?.rows ?? 7 }, (_, i) => i) as r (r)}
            <option value={r}>{r + 1}</option>
          {/each}
        </select>
      </label>
      <p class="hint">
        Sur ton pan, cette grille décrit la poutre posée au-dessus, pas des prises du pan : ne pas la fusionner.
        L'option reste là pour un autre catalogue où elle décrirait de vraies prises.
      </p>
    </details>

    {#if app.walls.length > 0 && app.wall}
      <label class="field">
        Pan actif
        <select
          value={app.wall.id}
          onchange={(e) => {
            app.selectWall((e.currentTarget as HTMLSelectElement).value);
            chessBlock = null;
            classicSession = [];
          }}
        >
          {#each app.walls as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
        </select>
      </label>
      <label class="field">
        Bas du mur
        <select value={app.wall.bottom} onchange={(e) => app.updateWall({ bottom: (e.currentTarget as HTMLSelectElement).value as Wall["bottom"] })}>
          <option value="last">rangée {app.wall.rows} (comme Brlok desktop)</option>
          <option value="first">rangée 1</option>
        </select>
      </label>
      <label class="field">
        Portée entre deux prises (cases)
        <input type="number" min="1" max="4" value={app.wall.reach} onchange={(e) => app.updateWall({ reach: Number((e.currentTarget as HTMLInputElement).value) })} />
      </label>
      <button class="primary" onclick={() => (editing = true)} disabled={editing}>Modifier le pan</button>
      <button onclick={exportFile}>Exporter pour Brlok desktop</button>
      {#if exportJson}
        <button onclick={copyExport}>Copier le JSON exporté</button>
        <textarea class="export" readonly rows="4" aria-label="JSON exporté">{exportJson}</textarea>
      {/if}
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

  {#if editing}
    <div class="edit-span">
      <WallEditor
        onClose={() => {
          editing = false;
          chessBlock = null;
          classicSession = [];
        }}
      />
    </div>
  {:else}
  <section class="panel pan-panel">
    {#if app.wall}
      <PanView wall={app.wall} sequence={currentBlock?.holds.map((h) => h.id) ?? []} />
    {:else}
      <p class="empty">Importe ton <code>catalog_collection.json</code> de Brlok, charge l'exemple, ou <button class="link" onclick={() => (editing = true)}>crée un pan</button>.</p>
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
        <span>
          Cote visée : <strong>{targetRating}</strong>
          {#if app.activePlayer}
            <button class="link" onclick={() => (targetRating = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
          {/if}
        </span>
        <input type="range" min="800" max="2300" step="50" bind:value={targetRating} />
      </label>
      <label class="field">
        Nombre de prises
        <input type="number" min="3" max="12" bind:value={length} />
      </label>
      <label class="check"><input type="checkbox" bind:checked={cruxLast} /> Crux en dernier (prise d'une pièce)</label>
      <label class="field">
        Pieds
        <select bind:value={feet}>
          {#each FOOT_RULES as r (r.id)}<option value={r.id}>{r.label}{r.bonus ? ` (+${r.bonus})` : ""}</option>{/each}
        </select>
      </label>
      <button class="primary" disabled={!app.wall} onclick={generateChess}>Générer</button>

      {#if chessBlock}
        <div class="result">
          <p class="sequence">{chessBlock.holds.map((h) => h.id).join(" → ")}</p>
          <p>Cote estimée : <strong>{chessBlock.estimatedRating}</strong></p>
          {#if chessBlock.feet}
            <p class="hint">
              {FOOT_RULES.find((r) => r.id === chessBlock!.feet)?.label}
              {#if chessBlock.noFootMove}: sans pied de {chessBlock.holds[chessBlock.noFootMove - 1]?.id} à {chessBlock.holds[chessBlock.noFootMove]?.id}{/if}
            </p>
          {/if}
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
          {#each LEVEL_PROFILES as p (p.level)}<option value={p.level}>{p.label}</option>{/each}
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
      <button class="primary" disabled={!app.wall} onclick={generateClassic}>Générer la séance</button>

      {#if classicSession.length > 0}
        <ol class="blocks">
          {#each classicSession as b, i (i)}
            <li>
              <button aria-pressed={classicSelected === i} onclick={() => { classicSelected = i; lastDelta = null; }}>
                Bloc {i + 1} · {b.estimatedRating}
              </button>
            </li>
          {/each}
        </ol>
        <p class="sequence">{classicSession[classicSelected]?.holds.map((h) => h.id).join(" → ")}</p>
      {/if}
    {/if}

    {#if currentBlock}
      <div class="attempt">
        {#if app.activePlayer}
          {#if recorded === currentKey}
            <p>
              Tentative enregistrée pour {app.activePlayer.name}
              {#if lastDelta !== null}({lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}){/if}.
            </p>
          {:else}
            <p class="hint">Tentative de <strong>{app.activePlayer.name}</strong> (cote de grimpe {Math.round(app.activePlayer.ratings.grimpe.rating)})</p>
            {#if !app.activePlayer.placedAt}
              <p class="hint">Pas encore de placement : la cote bougera beaucoup sur les premiers blocs. Le placement se lance depuis l'onglet Joueurs.</p>
            {/if}
            <div class="row two">
              <button class="success" onclick={() => record(true)}>Réussi</button>
              <button class="fall" onclick={() => record(false)}>Chute</button>
            </div>
          {/if}
        {:else}
          <p class="hint">Crée un joueur (onglet Joueurs) pour enregistrer tes tentatives et faire évoluer ta cote.</p>
        {/if}
      </div>
    {/if}
  </section>
  {/if}
</div>

<style>
  .screen {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(280px, 1fr) minmax(260px, 340px);
    gap: 16px;
    align-items: start;
  }
  .edit-span {
    grid-column: span 2;
    min-width: 0;
  }
  @media (max-width: 960px) {
    .edit-span {
      grid-column: auto;
      order: -1;
    }
    .screen {
      grid-template-columns: 1fr;
    }
    .pan-panel {
      order: -1;
    }
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
  .export {
    width: 100%;
    font: 0.75rem ui-monospace, monospace;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
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
  .result,
  .attempt {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .result p,
  .attempt p {
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
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .link {
    min-height: 0;
    padding: 0 6px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  input[type="range"] {
    width: 100%;
  }
</style>
