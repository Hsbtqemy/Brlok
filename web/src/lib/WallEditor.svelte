<script lang="ts">
  import { holdAt, holdId, MAX_LEVEL, MIN_LEVEL, type Position, type Wall } from "../core/wall";
  import {
    duplicateWall,
    HOLD_TYPES,
    linksOf,
    MAX_COLS,
    MAX_ROWS,
    newWall,
    resizeWall,
    setHold,
    toggleForbiddenLink,
    toggleTag,
    type HoldPatch,
  } from "../core/wallEdit";
  import { app } from "./appState.svelte";
  import { LEVEL_COLORS, LEVEL_TEXT } from "./colors";
  import PanView from "./PanView.svelte";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let selected = $state<Position | null>(null);
  /** Mode « enchaînement impossible » : la prochaine prise touchée est reliée à la sélection. */
  let linking = $state(false);
  let customTag = $state("");
  let message = $state("");
  let rows = $state(app.wall?.rows ?? 7);
  let cols = $state(app.wall?.cols ?? 6);
  let confirmResize = $state<string[] | null>(null);
  let confirmDelete = $state(false);
  let newName = $state("");
  let newRows = $state(7);
  let newCols = $state(6);

  const wall = $derived(app.wall);
  const hold = $derived(wall && selected ? holdAt(wall, selected) : undefined);
  const links = $derived(wall && hold ? linksOf(wall, hold.id) : []);
  const levels = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => i + MIN_LEVEL);

  // Garder les champs de taille en phase avec le pan affiché.
  $effect(() => {
    rows = wall?.rows ?? 7;
    cols = wall?.cols ?? 6;
  });

  function save(next: Wall) {
    app.setWalls(app.walls.map((w) => (w.id === next.id ? next : w)));
  }

  function onCell(position: Position) {
    if (!wall) return;
    message = "";
    const target = holdAt(wall, position);
    if (linking && hold && target && target.id !== hold.id) {
      save(toggleForbiddenLink(wall, hold.id, target.id));
      linking = false;
      return;
    }
    linking = false;
    selected = position;
  }

  function patch(p: HoldPatch | null) {
    if (!wall || !selected) return;
    save(setHold(wall, selected, p));
  }

  function addCustomTag() {
    const tag = customTag.trim();
    if (!tag || !hold) return;
    patch({ tags: hold.tags.includes(tag) ? hold.tags : [...hold.tags, tag] });
    customTag = "";
  }

  function applyResize(force = false) {
    if (!wall) return;
    const { wall: resized, removed } = resizeWall(wall, rows, cols);
    if (removed.length > 0 && !force) {
      confirmResize = removed;
      return;
    }
    confirmResize = null;
    save(resized);
    if (selected && (selected.row >= resized.rows || selected.col >= resized.cols)) selected = null;
    message = removed.length ? `Grille ${resized.cols} × ${resized.rows} : ${removed.length} prise(s) retirée(s).` : `Grille ${resized.cols} × ${resized.rows}.`;
  }

  function createWall() {
    const wall = newWall(newName || "Nouveau pan", newRows, newCols);
    app.setWalls([...app.walls, wall], wall.id);
    newName = "";
    selected = null;
    message = `Pan « ${wall.name} » créé : touche les cases pour poser les prises.`;
  }

  function duplicate() {
    if (!wall) return;
    const copy = duplicateWall(wall, `${wall.name} (copie)`);
    app.setWalls([...app.walls, copy], copy.id);
    message = `Copie créée : « ${copy.name} ».`;
  }

  function removeWall() {
    if (!wall) return;
    if (!confirmDelete) {
      confirmDelete = true;
      return;
    }
    confirmDelete = false;
    const rest = app.walls.filter((w) => w.id !== wall.id);
    app.setWalls(rest, rest[0]?.id);
    selected = null;
    message = "Pan supprimé.";
  }
</script>

<div class="editor">
  <section class="panel pan-side">
    <div class="head">
      <h2>Modifier le pan</h2>
      <button class="primary" onclick={onClose}>Terminé</button>
    </div>
    {#if wall}
      <p class="hint">
        {linking ? "Touche la prise avec laquelle l'enchaînement est impossible." : "Touche une case pour poser, modifier ou retirer une prise."}
        Les changements sont enregistrés tout de suite.
      </p>
      <PanView {wall} {onCell} {selected} linked={new Set(links)} />
    {:else}
      <p class="hint">Aucun pan : crée-en un ci-contre, ou importe ton catalogue Brlok.</p>
    {/if}
  </section>

  <section class="panel inspector">
    {#if wall && selected}
      {#if hold}
        <h2>Prise {hold.id}</h2>
        <div class="field">
          Niveau
          <div class="levels">
            {#each levels as level (level)}
              <button
                class="level"
                aria-pressed={hold.level === level}
                style:background={hold.level === level ? LEVEL_COLORS[level] : undefined}
                style:color={hold.level === level ? LEVEL_TEXT[level] : undefined}
                style:border-color={LEVEL_COLORS[level]}
                onclick={() => patch({ level })}
              >
                {level}
              </button>
            {/each}
          </div>
        </div>
        <div class="field">
          Type
          <div class="chips">
            {#each HOLD_TYPES as type (type)}
              <button class="chip" aria-pressed={hold.tags.includes(type)} onclick={() => patch({ tags: toggleTag(hold.tags, type) })}>{type}</button>
            {/each}
            {#each hold.tags.filter((t) => !(HOLD_TYPES as readonly string[]).includes(t)) as tag (tag)}
              <button class="chip" aria-pressed="true" onclick={() => patch({ tags: toggleTag(hold.tags, tag) })} title="Retirer">{tag} ✕</button>
            {/each}
          </div>
          <form
            class="row"
            onsubmit={(e) => {
              e.preventDefault();
              addCustomTag();
            }}
          >
            <input type="text" id="custom-tag" bind:value={customTag} placeholder="Autre étiquette" aria-label="Autre étiquette" />
            <button type="submit">Ajouter</button>
          </form>
        </div>
        <label class="check"><input type="checkbox" checked={hold.active} onchange={() => patch({ active: !hold.active })} /> Prise utilisable</label>
        <div class="field">
          Enchaînements impossibles
          {#if links.length}
            <div class="chips">
              {#each links as id (id)}
                <button class="chip" onclick={() => save(toggleForbiddenLink(wall, hold.id, id))} title="Retirer">{hold.id} ↔ {id} ✕</button>
              {/each}
            </div>
          {:else}
            <span class="hint">Aucun.</span>
          {/if}
          <button aria-pressed={linking} onclick={() => (linking = !linking)}>
            {linking ? "Annuler" : "Marquer un enchaînement impossible…"}
          </button>
        </div>
        <button class="danger" onclick={() => patch(null)}>Retirer la prise</button>
      {:else}
        <h2>Case {holdId(selected)}</h2>
        <p class="hint">Case vide. Poser une prise de niveau :</p>
        <div class="levels">
          {#each levels as level (level)}
            <button class="level" style:border-color={LEVEL_COLORS[level]} onclick={() => patch({ level })}>{level}</button>
          {/each}
        </div>
      {/if}
    {:else if wall}
      <h2>{wall.name}</h2>
      <p class="hint">{wall.holds.length} prise(s), {wall.holds.filter((h) => !h.active).length} inutilisable(s), {wall.forbiddenLinks.length} enchaînement(s) impossible(s).</p>
    {/if}

    {#if wall}
      <details>
        <summary>Pan : nom, grille, orientation</summary>
        <div class="settings">
          <label class="field">
            Nom
            <input type="text" id="wall-name" value={wall.name} onchange={(e) => save({ ...wall, name: (e.currentTarget as HTMLInputElement).value.trim() || wall.name })} />
          </label>
          <div class="row">
            <label class="field">Colonnes <input type="number" id="wall-cols" min="1" max={MAX_COLS} bind:value={cols} /></label>
            <label class="field">Rangées <input type="number" id="wall-rows" min="1" max={MAX_ROWS} bind:value={rows} /></label>
            <button onclick={() => applyResize()} disabled={rows === wall.rows && cols === wall.cols}>Appliquer</button>
          </div>
          {#if confirmResize}
            <p class="warn">Ces prises sortent de la grille et seront retirées : {confirmResize.join(", ")}.</p>
            <div class="row">
              <button class="danger" onclick={() => applyResize(true)}>Retirer et redimensionner</button>
              <button onclick={() => (confirmResize = null)}>Annuler</button>
            </div>
          {/if}
          <div class="row">
            <button onclick={duplicate}>Dupliquer ce pan</button>
            <button class="danger" onclick={removeWall}>{confirmDelete ? "Confirmer la suppression" : "Supprimer ce pan"}</button>
          </div>
        </div>
      </details>
    {/if}

    <details open={!wall}>
      <summary>Nouveau pan</summary>
      <div class="settings">
        <label class="field">Nom <input type="text" id="new-wall-name" bind:value={newName} placeholder="Ex. Pan du garage" /></label>
        <div class="row">
          <label class="field">Colonnes <input type="number" id="new-wall-cols" min="1" max={MAX_COLS} bind:value={newCols} /></label>
          <label class="field">Rangées <input type="number" id="new-wall-rows" min="1" max={MAX_ROWS} bind:value={newRows} /></label>
        </div>
        <button onclick={createWall}>Créer un pan vide</button>
      </div>
    </details>

    {#if message}<p class="message">{message}</p>{/if}
  </section>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: minmax(280px, 1.4fr) minmax(260px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 800px) {
    .editor {
      grid-template-columns: 1fr;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .level {
    min-height: 48px;
    padding: 0;
    font-weight: 700;
    font-size: 1.1rem;
    border-width: 2px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.85rem;
  }
  .settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .settings .row {
    align-items: flex-end;
  }
  .settings input[type="number"] {
    width: 90px;
  }
  form.row input {
    flex: 1;
    min-width: 0;
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
