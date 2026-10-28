<script lang="ts">
  import exampleCatalog from "../../../data/catalog_collection.json";
  import { exportBrlok, importBrlok, type FootMerge } from "../core/brlokImport";
  import { EXPRESS_LEVEL, expressWall, newWall } from "../core/wallEdit";
  import type { Wall } from "../core/wall";
  import { app } from "./appState.svelte";
  import GymEditor from "./GymEditor.svelte";
  import WallEditor from "./WallEditor.svelte";
  import BeamEditor from "./BeamEditor.svelte";
  import { emptyBeam } from "../core/beam";
  import { saveFile } from "./fileSave";

  /** Onglet Murs : décrire les pans et les murs à voies (l'onglet Grimper sert à les utiliser). */
  interface Props {
    /** Ouvrir directement l'éditeur du mur actif. */
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  let message = $state("");
  let expressCols = $state(6);
  let expressRows = $state(7);
  let footRowOffset = $state<number | null>(null);
  let footMerges = $state<FootMerge[]>([]);
  let exportJson = $state<string | null>(null);

  const isGym = $derived(app.wall?.kind === "voies");

  function openWall(id: string) {
    app.selectWall(id);
    exportJson = null;
    open = true;
  }

  function createExpress() {
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const wall = expressWall(`Pan express ${expressCols}×${expressRows} (${date})`, expressRows, expressCols);
    app.setWalls([...app.walls, wall], wall.id);
    message = `Pan express créé : ${wall.holds.length} prises de niveau ${EXPRESS_LEVEL}. Tu peux grimper tout de suite, ou l'affiner en l'ouvrant.`;
  }

  function createPan() {
    const wall = newWall("Nouveau pan", 7, 6);
    app.setWalls([...app.walls, wall], wall.id);
    open = true;
  }

  /** Une poutre sans pan (maison, salle) : un mur sans prises, avec sa poutre. */
  function createBeam() {
    const wall = { ...newWall("Poutre", 1, 1), beam: emptyBeam() };
    app.setWalls([...app.walls, wall], wall.id);
    open = true;
  }

  function createGym() {
    const wall = { ...newWall("Ma salle", 1, 1), kind: "voies" as const };
    app.setWalls([...app.walls, wall], wall.id);
    open = true;
  }

  function loadData(data: unknown, source: string) {
    try {
      const imported = importBrlok(data, { footRowOffset });
      const ids = new Set(imported.map((i) => i.wall.id));
      app.setWalls([...app.walls.filter((w) => !ids.has(w.id)), ...imported.map((i) => i.wall)], imported[0]?.wall.id);
      footMerges = imported.flatMap((i) => i.footMerges);
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

  async function exportFile() {
    const { data, clamped, beamCut } = exportBrlok(app.walls, app.wall?.id);
    exportJson = JSON.stringify(data, null, 2);
    const result = await saveFile("catalog_collection.json", exportJson).catch((e: Error) => {
      message = e.message;
      return null;
    });
    if (result !== "saved") return;
    message = [
      clamped.length
        ? `Exporté. Brlok desktop limite les mains au niveau 5 : ${clamped.length} prise(s) de niveau 6 ramenée(s) à 5.`
        : "Exporté au format Brlok desktop. Si le téléchargement est bloqué, copie le JSON ci-dessous.",
      beamCut.length ? `Poutre coupée à 4 × 6 (format de Brlok desktop) : ${beamCut.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  /** Copie du JSON exporté : repli quand le téléchargement est bloqué (page intégrée). */
  async function copyExport() {
    if (!exportJson) return;
    try {
      await navigator.clipboard.writeText(exportJson);
      message = "JSON copié : colle-le dans un fichier catalog_collection.json.";
    } catch {
      message = "Copie refusée : sélectionne le texte ci-dessous et copie-le à la main.";
    }
  }

  const describe = (w: Wall) =>
    w.kind === "voies"
      ? `Mur à voies · ${w.routes.filter((r) => !r.archived).length} voie(s)${w.sectors?.length ? ` · ${w.sectors.length} secteur(s)` : ""}`
      : w.holds.length === 0 && w.beam
        ? `Poutre · ${w.beam.holds.length} prise(s)`
        : `Pan ${w.cols} × ${w.rows} · ${w.holds.length} prises${w.beam ? ` · poutre ${w.beam.placement === "integree" ? "intégrée" : "à part"}` : ""}`;
</script>

{#if open && app.wall}
  {#if isGym}
    <GymEditor onClose={() => (open = false)} />
  {:else}
    <div class="pan-page">
      <section class="panel pan-settings">
        <div class="row">
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
          <button onclick={exportFile}>Exporter pour Brlok desktop</button>
          {#if exportJson}<button onclick={copyExport}>Copier le JSON</button>{/if}
        </div>
        {#if exportJson}<textarea class="export" readonly rows="4" aria-label="JSON exporté">{exportJson}</textarea>{/if}
        {#if message}<p class="message">{message}</p>{/if}
      </section>
      <WallEditor onClose={() => (open = false)} />
      <BeamEditor />
    </div>
  {/if}
{:else}
  <div class="walls">
    <section class="panel">
      <h2>Mes murs</h2>
      {#if app.walls.length === 0}
        <p class="hint">Aucun mur pour l'instant : crée un pan ou un mur à voies, ou importe ton catalogue Brlok.</p>
      {/if}
      <ul class="list">
        {#each app.walls as w (w.id)}
          {@const thumb = w.sectors?.find((s) => s.photo)?.photo}
          <li>
            <button class="wall-card" aria-pressed={w.id === app.wall?.id} onclick={() => openWall(w.id)}>
              {#if thumb}<img src={thumb} alt="" />{:else}<span class="glyph">{w.kind === "voies" ? "◐" : "▦"}</span>{/if}
              <span class="info">
                <strong>{w.name}</strong>
                <small>{describe(w)}</small>
              </span>
              <span class="go">Ouvrir ›</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if message}<p class="message">{message}</p>{/if}
    </section>

    <section class="panel">
      <h2>Nouveau mur</h2>
      <button class="primary" onclick={createGym}>Mur à voies (salle)</button>
      <p class="hint">Une photo par secteur, puis les voies : couleur, cotation, prises sur la photo.</p>
      <button onclick={createPan}>Pan à grille (vide)</button>
      <button onclick={createBeam}>Poutre seule</button>
      <p class="hint">Une poutre sans pan, pour les suspensions. Un pan ou un mur à voies peut aussi avoir sa poutre (sur sa page).</p>
      <details class="express">
        <summary>Pan express</summary>
        <p class="hint">Une prise par case, toutes de niveau moyen : pour jouer tout de suite sans décrire le pan.</p>
        <div class="row">
          <label class="field">Colonnes <input type="number" id="express-cols" min="2" max="26" bind:value={expressCols} /></label>
          <label class="field">Rangées <input type="number" id="express-rows" min="2" max="30" bind:value={expressRows} /></label>
        </div>
        <button class="primary" onclick={createExpress}>Créer le pan express</button>
      </details>
      <h2>Importer</h2>
      <div class="row">
        <label class="file">
          <input type="file" accept="application/json,.json" onchange={onFile} />
          <span>Catalogue Brlok…</span>
        </label>
        <button onclick={() => loadData(exampleCatalog, "l'exemple du dépôt")}>Charger l'exemple</button>
      </div>
      <details>
        <summary>Option d'import : « grille pieds » de Brlok desktop</summary>
        <label class="field">
          Fusionner la grille pieds dans le pan, à partir de la rangée
          <select bind:value={footRowOffset}>
            <option value={null}>ne pas fusionner (recommandé)</option>
            {#each Array.from({ length: 12 }, (_, i) => i) as r (r)}<option value={r}>{r + 1}</option>{/each}
          </select>
        </label>
        <p class="hint">Sur ton pan, cette grille décrit la poutre posée au-dessus, pas des prises du pan : sans fusion, elle devient la poutre du pan.</p>
      </details>
      {#if footMerges.length > 0}
        <details>
          <summary>{footMerges.length} prise(s) enrichie(s) par la grille pieds</summary>
          <ul class="merges">
            {#each footMerges as m (m.holdId + m.spec)}
              <li><strong>{m.holdId}</strong> ← « {m.spec} »</li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  </div>
{/if}

<style>
  .walls {
    display: grid;
    grid-template-columns: minmax(280px, 1.4fr) minmax(260px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .walls {
      grid-template-columns: 1fr;
    }
  }
  .pan-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .pan-settings .row {
    align-items: flex-end;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wall-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    text-align: left;
  }
  .wall-card img,
  .glyph {
    width: 64px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    flex: none;
  }
  .glyph {
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    background: var(--bg);
    color: var(--muted);
  }
  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .info small {
    color: var(--muted);
  }
  .go {
    color: var(--accent);
    font-size: 0.9rem;
    white-space: nowrap;
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
    font-family: monospace;
    font-size: 0.75rem;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
  .express .row input[type="number"] {
    width: 80px;
  }
  .merges {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 0.85rem;
  }
</style>
