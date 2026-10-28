<script lang="ts">
  import exampleCatalog from "../../../data/catalog_collection.json";
  import { BEAM_COLS, BEAM_ROWS, beamFromDesktop, beamHoldId, emptyBeam, specTags } from "../core/beam";
  import { clampLevel, type Beam, type Hold, type Position } from "../core/wall";
  import { app } from "./appState.svelte";
  import BeamView from "./BeamView.svelte";

  /** La poutre du mur actif (POUTRE.md) : placement, taille, prises (étiquette, niveau, type). */
  const BEAM_TYPES = ["bac", "réglette", "plat", "bi-doigt", "mono", "pince"] as const;

  let selected = $state<Position | null>(null);
  let confirmRemove = $state(false);
  let message = $state("");

  const wall = $derived(app.wall);
  const beam = $derived(wall?.beam);
  const hold = $derived(beam && selected ? beam.holds.find((h) => h.position.row === selected!.row && h.position.col === selected!.col) : undefined);
  const isPan = $derived(wall?.kind === "pan");

  function save(next: Beam | undefined) {
    app.updateWall({ beam: next });
  }

  function exampleBeam(): Beam | undefined {
    const c = (exampleCatalog as { catalogs: { catalog: { foot_grid?: string[][]; foot_levels?: number[][] } }[] }).catalogs[0]?.catalog;
    return beamFromDesktop(c?.foot_grid, c?.foot_levels);
  }

  function patchHold(patch: Partial<Hold> | null) {
    if (!beam || !selected) return;
    const pos = selected;
    const others = beam.holds.filter((h) => !(h.position.row === pos.row && h.position.col === pos.col));
    if (patch === null) {
      save({ ...beam, holds: others });
      return;
    }
    const base: Hold = hold ?? { id: beamHoldId(pos), level: 3, tags: [], position: { ...pos }, active: true };
    const next: Hold = { ...base, ...patch, position: { ...pos } };
    save({ ...beam, holds: [...others, next].sort((a, b) => a.position.row - b.position.row || a.position.col - b.position.col) });
  }

  function setLabel(text: string) {
    const label = text.trim();
    // L'étiquette de Brlok desktop donne aussi le type (« bi30 » → bi-doigt), sauf si un type est déjà choisi.
    const tags = hold?.tags.length ? hold.tags : specTags(label);
    patchHold({ label: label || undefined, tags });
  }

  function toggleType(type: string) {
    const tags = hold?.tags ?? [];
    patchHold({ tags: tags.includes(type) ? tags.filter((t) => t !== type) : [...tags, type] });
  }

  function resize(rows: number, cols: number) {
    if (!beam) return;
    const r = Math.max(1, Math.min(8, Math.round(rows) || 1));
    const c = Math.max(1, Math.min(12, Math.round(cols) || 1));
    const kept = beam.holds.filter((h) => h.position.row < r && h.position.col < c);
    const lost = beam.holds.length - kept.length;
    if (lost > 0 && !confirm(`${lost} prise(s) sortent de la poutre et seront retirées. Continuer ?`)) return;
    save({ ...beam, rows: r, cols: c, holds: kept });
    if (selected && (selected.row >= r || selected.col >= c)) selected = null;
  }
</script>

<section class="panel beam-editor">
  <h2>Poutre</h2>
  {#if !beam}
    <p class="hint">
      Une poutre d'entraînement rattachée à ce mur : pour des suspensions (onglet Grimper → Poutre), des défis Chesscalade{isPan
        ? ", et, intégrée au pan, comme des prises de plus au-dessus de la rangée du haut"
        : ""}.
    </p>
    <div class="row">
      <button class="primary" onclick={() => save(emptyBeam())}>Ajouter une poutre {BEAM_ROWS} × {BEAM_COLS}</button>
      <button
        onclick={() => {
          const b = exampleBeam();
          if (b) save(b);
          message = b ? "Poutre du pan maison reprise (catalogue d'exemple)." : "";
        }}>Reprendre la poutre du pan maison</button
      >
    </div>
    <p class="hint">Un catalogue Brlok desktop importé apporte sa poutre (la « grille pieds ») : rien à saisir.</p>
  {:else}
    {#if isPan}
      <div class="row placement" role="group" aria-label="Place de la poutre">
        <button aria-pressed={beam.placement === "integree"} onclick={() => save({ ...beam, placement: "integree" })}>Intégrée au pan</button>
        <button aria-pressed={beam.placement === "agres"} onclick={() => save({ ...beam, placement: "agres" })}>Agrès à part</button>
      </div>
      <p class="hint">
        {beam.placement === "integree"
          ? "Ses prises sont des prises du pan, juste au-dessus de la rangée du haut : les blocs peuvent passer par elles."
          : "Hors du trajet des blocs : suspensions, et sortie des blocs à la poutre (option de la séance)."}
      </p>
    {/if}
    <BeamView {beam} onCell={(p) => (selected = selected && selected.row === p.row && selected.col === p.col ? null : p)} {selected} />
    {#if selected}
      <div class="cell-editor">
        <h3>{hold ? `Prise ${hold.id}` : `Case vide (rangée ${selected.row + 1}, colonne ${selected.col + 1})`}</h3>
        {#if !hold}
          <button class="primary" onclick={() => patchHold({})}>Poser une prise ici</button>
        {:else}
          <label class="field">
            Étiquette (ex. 25, [35°], bi30)
            <input type="text" value={hold.label ?? ""} onchange={(e) => setLabel((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="field">
            Niveau
            <div class="row levels">
              {#each [1, 2, 3, 4, 5, 6] as l (l)}
                <button aria-pressed={hold.level === l} onclick={() => patchHold({ level: clampLevel(l) })}>{l}</button>
              {/each}
            </div>
          </div>
          <div class="field">
            Type
            <div class="row">
              {#each BEAM_TYPES as t (t)}
                <button class="chip" aria-pressed={hold.tags.includes(t)} onclick={() => toggleType(t)}>{t}</button>
              {/each}
            </div>
          </div>
          <div class="row">
            <label class="check"><input type="checkbox" checked={hold.active} onchange={(e) => patchHold({ active: (e.currentTarget as HTMLInputElement).checked })} /> Utilisable</label>
            <button class="danger-soft" onclick={() => patchHold(null)}>Retirer la prise</button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="hint">Touche une case pour poser une prise ou la modifier.</p>
    {/if}
    <details>
      <summary>Taille, retirer la poutre</summary>
      <div class="row size">
        <label class="field">Rangées <input type="number" min="1" max="8" value={beam.rows} onchange={(e) => resize(Number((e.currentTarget as HTMLInputElement).value), beam.cols)} /></label>
        <label class="field">Colonnes <input type="number" min="1" max="12" value={beam.cols} onchange={(e) => resize(beam.rows, Number((e.currentTarget as HTMLInputElement).value))} /></label>
      </div>
      <p class="hint">La main gauche se pose sur les colonnes de gauche, la droite sur celles de droite. Brlok desktop garde une poutre de {BEAM_ROWS} × {BEAM_COLS}.</p>
      <button
        class="danger-soft"
        class:armed={confirmRemove}
        onclick={() => {
          if (!confirmRemove) {
            confirmRemove = true;
            return;
          }
          confirmRemove = false;
          selected = null;
          save(undefined);
        }}>{confirmRemove ? "Confirmer : retirer la poutre" : "Retirer la poutre"}</button
      >
    </details>
  {/if}
  {#if message}<p class="message">{message}</p>{/if}
</section>

<style>
  .beam-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .placement button {
    flex: 1;
  }
  .cell-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  .levels button {
    min-width: 44px;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
  }
  .size input {
    width: 80px;
  }
  details summary {
    cursor: pointer;
  }
  .danger-soft.armed {
    background: #c62828;
    color: #fff;
    border-color: #c62828;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
