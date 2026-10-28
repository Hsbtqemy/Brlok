<script lang="ts">
  import { routeHex, routeLabel } from "../core/gym";
  import { orderedMarks, sectorOf, type Route, type Sector, type Wall } from "../core/wall";
  import { app } from "./appState.svelte";
  import { photoFromFile } from "./photo";
  import RouteEditor from "./RouteEditor.svelte";
  import RouteMarks from "./RouteMarks.svelte";

  /** Page d'un mur à voies : ses secteurs (photos) et ses voies ; chaque voie s'ouvre dans son propre éditeur. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  const wall = $derived(app.wall);
  let message = $state("");
  let busy = $state(false);
  let showArchived = $state(false);
  let confirmDelete = $state<string | null>(null);
  let confirmSectorDelete = $state(false);
  /** Éditeur de voie ouvert : `null` pour une nouvelle voie. */
  let editing = $state<{ routeId: string | null } | null>(null);
  /** Voie mise en avant sur la carte du secteur. */
  let highlighted = $state<string | null>(null);

  const sectors = $derived(wall?.sectors ?? []);
  let sectorId = $state<string | null>(null);
  const sector = $derived<Sector | undefined>(sectors.find((x) => x.id === sectorId) ?? sectors[0]);
  const routes = $derived((wall?.routes ?? []).filter((r) => showArchived || !r.archived));
  const inSector = (r: Route) => !!wall && sectorOf(wall, r)?.id === sector?.id;
  const sectorRoutes = $derived(sectors.length ? routes.filter(inSector) : routes);
  const otherCount = $derived(routes.length - sectorRoutes.length);

  function save(next: Wall) {
    app.setWalls(app.walls.map((w) => (w.id === next.id ? next : w)));
  }

  function openSector(id: string) {
    sectorId = id;
    confirmSectorDelete = false;
    highlighted = null;
  }

  /** Photo : `nouveau` crée un secteur, sinon remplace la photo du secteur ouvert. */
  async function onPhoto(event: Event, nouveau: boolean) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !wall) return;
    busy = true;
    message = `Photo reçue (${(file.size / 1_000_000).toFixed(1)} Mo) : préparation…`;
    try {
      const photo = await photoFromFile(file);
      if (nouveau || !sector) {
        const id = `s-${Date.now().toString(36)}`;
        // Les voies sans secteur désigné appartiennent au premier : on l'écrit avant d'en ajouter un autre.
        const first = sectors[0]?.id;
        const routesFixed = first ? wall.routes.map((r) => (r.sectorId ? r : { ...r, sectorId: first })) : wall.routes;
        save({ ...wall, routes: routesFixed, sectors: [...sectors, { id, name: `Secteur ${sectors.length + 1}`, photo }] });
        sectorId = id;
        message = "Secteur ajouté. Donne-lui un nom, puis crée ses voies.";
      } else {
        save({ ...wall, sectors: sectors.map((x) => (x.id === sector.id ? { ...x, photo } : x)) });
        message = "Photo remplacée : vérifie la place des prises des voies de ce secteur.";
      }
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function renameSector(name: string) {
    if (!wall || !sector || !name.trim()) return;
    save({ ...wall, sectors: sectors.map((x) => (x.id === sector.id ? { ...x, name: name.trim() } : x)) });
  }

  function deleteSector() {
    if (!wall || !sector) return;
    const count = wall.routes.filter((r) => sectorOf(wall, r)?.id === sector.id).length;
    if (count > 0) {
      message = `Ce secteur a ${count} voie(s) : supprime-les d'abord (ou garde le secteur : une voie démontée y reste avec son historique).`;
      return;
    }
    if (!confirmSectorDelete) {
      confirmSectorDelete = true;
      return;
    }
    const rest = sectors.filter((x) => x.id !== sector.id);
    save({ ...wall, sectors: rest });
    sectorId = rest[0]?.id ?? null;
    confirmSectorDelete = false;
  }

  function toggleArchive(r: Route) {
    if (!wall) return;
    save({ ...wall, routes: wall.routes.map((x) => (x.id === r.id ? { ...x, archived: !x.archived } : x)) });
  }

  function removeRoute(r: Route) {
    if (!wall) return;
    if (confirmDelete !== r.id) {
      confirmDelete = r.id;
      return;
    }
    confirmDelete = null;
    save({ ...wall, routes: wall.routes.filter((x) => x.id !== r.id) });
  }

  function closeEditor(msg?: string) {
    editing = null;
    if (msg) message = msg;
  }
</script>

{#if editing}
  <RouteEditor routeId={editing.routeId} sectorId={sector?.id ?? null} onDone={closeEditor} />
{:else if wall}
  <div class="gym">
    <section class="panel">
      <div class="head">
        <h2>{wall.name}</h2>
        <button class="primary" onclick={onClose}>Terminé</button>
      </div>
      <label class="field">
        Nom de la salle
        <input type="text" id="gym-name" value={wall.name} onchange={(e) => save({ ...wall, name: (e.currentTarget as HTMLInputElement).value.trim() || wall.name })} />
      </label>
      <div class="field">
        Secteurs
        <div class="sectors">
          {#each sectors as sec (sec.id)}
            <button class="sector-chip" aria-pressed={sec.id === sector?.id} onclick={() => openSector(sec.id)}>
              {#if sec.photo}<img src={sec.photo} alt="" />{/if}
              <span>{sec.name}</span>
              <small>{wall.routes.filter((r) => !r.archived && sectorOf(wall, r)?.id === sec.id).length} voie(s)</small>
            </button>
          {/each}
          <div class="sector-add">
            <span class="add-title">{busy ? "Analyse…" : sectors.length ? "+ Secteur" : "Premier secteur"}</span>
            <label class="file small">
              <input type="file" accept="image/*" capture="environment" onchange={(e) => onPhoto(e, true)} />
              <span>📷 Photo</span>
            </label>
            <label class="file small">
              <input type="file" accept="image/*" onchange={(e) => onPhoto(e, true)} />
              <span>Image…</span>
            </label>
          </div>
        </div>
      </div>
      {#if message}<p class="message" role="status">{message}</p>{/if}
      {#if sector}
        <div class="row sector-edit">
          <input type="text" aria-label="Nom du secteur" value={sector.name} onchange={(e) => renameSector((e.currentTarget as HTMLInputElement).value)} />
          <span class="hint">Changer la photo :</span>
          <label class="file small">
            <input type="file" accept="image/*" capture="environment" onchange={(e) => onPhoto(e, false)} />
            <span>📷 Photo</span>
          </label>
          <label class="file small">
            <input type="file" accept="image/*" onchange={(e) => onPhoto(e, false)} />
            <span>Image…</span>
          </label>
          <button class="danger small" onclick={deleteSector}>{confirmSectorDelete ? "Supprimer le secteur ?" : "Supprimer"}</button>
        </div>
        {#if sector.photo}
          <div class="map">
            <img src={sector.photo} alt={`Photo du secteur ${sector.name}`} />
            {#each sectorRoutes.filter((r) => !r.archived && (!highlighted || r.id === highlighted)) as r (r.id)}
              <RouteMarks marks={highlighted || orderedMarks(r.marks).length === 0 ? (r.marks ?? []) : (r.marks ?? []).map(({ n: _n, ...m }) => m)} color={routeHex(r)} />
            {/each}
          </div>
          <p class="hint">
            {highlighted ? "Voie mise en avant." : "Toutes les voies du secteur."} Touche une voie de la liste pour la mettre en avant.
            {#if highlighted}<button class="link" onclick={() => (highlighted = null)}>Toutes</button>{/if}
          </p>
        {/if}
      {:else}
        <p class="hint">Sans photo, les voies se décrivent par leur couleur, leur cotation et leur style. Avec une photo par secteur, on place aussi leurs prises.</p>
      {/if}
    </section>

    <section class="panel">
      <div class="head">
        <h2>Voies{sector && sectors.length > 1 ? ` · ${sector.name}` : ""} ({sectorRoutes.filter((r) => !r.archived).length})</h2>
        <button class="primary" onclick={() => (editing = { routeId: null })}>+ Nouvelle voie</button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={showArchived} /> Afficher les voies démontées</label>
      <ul class="routes">
        {#each sectorRoutes as r (r.id)}
          <li class:archived={r.archived} class:highlighted={highlighted === r.id}>
            <button class="route-main" onclick={() => (highlighted = highlighted === r.id ? null : r.id)}>
              <span class="dot big" style:background={routeHex(r)}></span>
              <span class="info">
                <strong>{routeLabel(r)}</strong>
                <span class="hint"
                  >{r.styles.join(" · ") || "sans style"}{r.marks?.length ? ` · ${r.marks.length} prises` : ""}{orderedMarks(r.marks).length ? " · ordre imposé" : ""}{r.archived
                    ? " · démontée"
                    : ""}</span
                >
              </span>
            </button>
            <div class="actions">
              <button onclick={() => (editing = { routeId: r.id })}>Modifier</button>
              <button onclick={() => toggleArchive(r)}>{r.archived ? "Remettre" : "Démonter"}</button>
              <button class="danger" onclick={() => removeRoute(r)}>{confirmDelete === r.id ? "Supprimer ?" : "✕"}</button>
            </div>
          </li>
        {:else}
          <li class="hint">Aucune voie dans ce secteur pour l'instant.</li>
        {/each}
      </ul>
      {#if otherCount > 0}<p class="hint">{otherCount} autre(s) voie(s) dans les autres secteurs.</p>{/if}
      <p class="hint">Démonter garde la voie et son historique ; elle n'est simplement plus proposée.</p>
    </section>
  </div>
{/if}

<style>
  .gym {
    display: grid;
    grid-template-columns: minmax(280px, 1.3fr) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .gym {
      grid-template-columns: 1fr;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    align-self: flex-start;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sectors {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .sector-chip {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 116px;
    padding: 6px;
    border-radius: 10px;
    text-align: left;
    font-size: 0.85rem;
  }
  .sector-chip img {
    width: 100%;
    height: 64px;
    object-fit: cover;
    border-radius: 6px;
  }
  .sector-chip small {
    color: var(--muted);
  }
  .sector-add {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 6px;
    border: 1px dashed var(--accent);
    border-radius: 10px;
    white-space: nowrap;
  }
  .add-title {
    font-size: 0.85rem;
    color: var(--accent);
    font-weight: 600;
  }
  .sector-add .file {
    min-height: 36px;
    padding: 0 10px;
  }
  .sector-edit {
    align-items: center;
  }
  .sector-edit input[type="text"] {
    flex: 1;
    min-width: 140px;
  }
  .small {
    min-height: 40px;
    font-size: 0.85rem;
  }
  .map {
    position: relative;
  }
  .map img {
    display: block;
    width: 100%;
    border-radius: 10px;
  }
  .link {
    min-height: 0;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  .routes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .routes li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .routes li.archived {
    opacity: 0.55;
  }
  .routes li.highlighted .route-main {
    border-color: var(--accent);
  }
  .route-main {
    flex: 1;
    min-width: 160px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    border-color: transparent;
    background: none;
    padding: 4px 6px;
  }
  .info {
    display: flex;
    flex-direction: column;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions button {
    min-height: 36px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .dot.big {
    width: 24px;
    height: 24px;
  }
  .danger {
    border-color: #c62828;
    color: #c62828;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
