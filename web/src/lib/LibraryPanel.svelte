<script lang="ts">
  import { withBeam } from "../core/beam";
  import type { Block } from "../core/generator";
  import {
    addFavorite,
    blockLabel,
    desktopFileKind,
    exportDesktopFavorites,
    filterHistory,
    importDesktopFavorites,
    importDesktopTemplates,
    mergeTemplates,
    refreshBlock,
    removeFavorite,
    removeFromHistory,
    removeTemplate,
    renameTemplate,
    runSummary,
    settingsText,
    updateFavorite,
    type SessionRecord,
    type SessionSettings,
    type SessionTemplate,
  } from "../core/library";
  import { formatClock } from "../core/intervals";
  import { app } from "./appState.svelte";
  import { saveFile } from "./fileSave";
  import { EXPORT_FORMATS, exportSession, type ExportFormat } from "./sessionFiles";

  /** Onglet « Bibliothèque » de Grimper : favoris, modèles et historique des séances (Brlok desktop). */
  interface Props {
    /** Lance une séance avec ces blocs (sur le mur actif). */
    onStart: (blocks: Block[], settings?: SessionSettings, templateName?: string) => void;
    /** Reprend les réglages d'un modèle dans l'onglet Séance. */
    onApplyTemplate: (template: SessionTemplate) => void;
    /** Montre un favori sur le mur (null : plus rien). */
    onPreview?: (block: Block | null) => void;
  }

  let { onStart, onApplyTemplate, onPreview }: Props = $props();
  let previewId = $state<string | null>(null);

  function preview(id: string) {
    const f = favorites.find((x) => x.id === id);
    previewId = previewId === id || !f || !wall ? null : id;
    onPreview?.(previewId && f && wall ? refreshBlock(withBeam(wall), f.block) : null);
  }

  let message = $state("");
  let confirmId = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameText = $state("");
  let days = $state<number | null>(null);
  let search = $state("");
  let thisWall = $state(true);

  const wall = $derived(app.wall);
  const kind = $derived(wall?.kind ?? "pan");
  const favorites = $derived(wall ? app.library.favorites.filter((f) => f.wallId === wall.id) : []);
  const templates = $derived(app.library.templates.filter((t) => t.settings.kind === kind));
  const history = $derived(filterHistory(app.library.history, { days, search, wallId: thisWall ? wall?.id : undefined }));

  /** Deux touchers pour supprimer : le premier arme le bouton. */
  function confirmed(id: string): boolean {
    if (confirmId === id) {
      confirmId = null;
      return true;
    }
    confirmId = id;
    return false;
  }

  function startFavorites(ids: string[]) {
    if (!wall) return;
    const picked = favorites.filter((f) => ids.includes(f.id));
    const blocks = picked.map((f) => refreshBlock(withBeam(wall), f.block)).filter((b): b is Block => b !== null);
    const missing = picked.length - blocks.length;
    if (blocks.length === 0) {
      message = "Ce bloc n'existe plus sur le mur (prise retirée, ou voie démontée).";
      return;
    }
    message = missing ? `${missing} favori(s) écarté(s) : une prise ou une voie n'est plus sur le mur.` : "";
    onStart(blocks);
  }

  function reload(record: SessionRecord) {
    const target = app.walls.find((w) => w.id === record.wallId);
    if (!target) {
      message = `Le mur « ${record.wallName} » n'existe plus.`;
      return;
    }
    if (target.id !== wall?.id) app.selectWall(target.id);
    // Les commentaires de la séance passée suivent leurs blocs ; les résultats repartent de zéro (startRun).
    const blocks = record.blocks.map((b) => refreshBlock(withBeam(target), b)).filter((b): b is Block => b !== null);
    if (blocks.length === 0) {
      message = "Aucun bloc de cette séance n'existe encore sur le mur.";
      return;
    }
    const missing = record.blocks.length - blocks.length;
    message = missing ? `${missing} bloc(s) écarté(s) : une prise ou une voie n'est plus sur le mur.` : "";
    onStart(blocks, record.settings, record.templateName);
  }

  async function exportRecord(record: SessionRecord, format: ExportFormat) {
    try {
      const recordWall = app.walls.find((w) => w.id === record.wallId);
      message = await exportSession(record, format, recordWall ? withBeam(recordWall) : undefined);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
  }

  async function onImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !wall) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      message = "Fichier illisible : ce n'est pas du JSON.";
      return;
    }
    const fileKind = desktopFileKind(data);
    if (fileKind === "modeles") {
      const { lib, added } = mergeTemplates(app.library, importDesktopTemplates(data));
      app.setLibrary(lib);
      message = added ? `${added} modèle(s) importé(s) (modèles de pan).` : "Aucun nouveau modèle : ils sont déjà là.";
      return;
    }
    if (fileKind === "favoris") {
      if (wall.kind !== "pan") {
        message = "Les favoris de Brlok desktop sont des blocs de pan : choisis d'abord le pan dans Grimper.";
        return;
      }
      const { blocks, skipped } = importDesktopFavorites(data, wall);
      let lib = app.library;
      let added = 0;
      for (const f of blocks) {
        const r = addFavorite(lib, wall.id, f.block, f.title ?? "Favori de Brlok desktop", f.comment);
        lib = r.lib;
        if (r.added) added++;
      }
      app.setLibrary(lib);
      message = `${added} favori(s) ajouté(s) à ${wall.name}${blocks.length - added ? `, ${blocks.length - added} déjà présent(s)` : ""}${skipped ? `, ${skipped} écarté(s) (prises absentes de ce pan)` : ""}.`;
      return;
    }
    message = "Ce fichier n'est ni des favoris ni des modèles de Brlok desktop (pour un catalogue, passe par Murs → Importer).";
  }

  async function exportFavorites() {
    if (!wall) return;
    const data = exportDesktopFavorites(app.library.favorites, wall.id);
    if (data.blocks.length === 0) {
      message = "Aucun favori de pan à exporter.";
      return;
    }
    const result = await saveFile("favorites.json", JSON.stringify(data, null, 2)).catch((e: Error) => {
      message = e.message;
      return null;
    });
    if (result === "saved") message = `${data.blocks.length} favori(s) exporté(s) au format Brlok desktop.`;
  }

  const dateText = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function timerText(t: SessionTemplate): string {
    if (!t.timer) return "";
    const c = t.timer.config;
    const base =
      c.mode === "chrono"
        ? "chrono"
        : c.mode === "emom"
          ? `EMOM ${c.rounds} min`
          : c.mode === "pyramide"
            ? `pyramide ${c.workMinS ?? c.workS}→${c.workMaxS ?? c.workS} s × ${c.rounds}`
            : `${c.workS}/${c.restS} × ${c.rounds}`;
    return [`minuteur ${base}`, t.timer.chained ? "enchaîné" : "", t.timer.pauseS ? `pause ${formatClock(t.timer.pauseS * 1000)}` : ""].filter(Boolean).join(", ");
  }
</script>

<div class="library">
  {#if message}<p class="message" role="status">{message}</p>{/if}
  {#if app.libraryStorageFull}
    <p class="warn">Le stockage de l'appareil est plein : la bibliothèque n'est plus enregistrée. Enregistre une sauvegarde (Joueurs), puis supprime de vieilles séances ou photos.</p>
  {/if}

  <section>
    <h3>Favoris{wall ? ` · ${wall.name}` : ""} ({favorites.length})</h3>
    {#if favorites.length === 0}
      <p class="hint">Aucun favori sur ce mur : ☆ sur un bloc ou une voie (Séance, Bloc-défi) l'ajoute ici.</p>
    {:else}
      <button class="primary" onclick={() => startFavorites(favorites.map((f) => f.id))}>Grimper tous les favoris ({favorites.length})</button>
      <ul class="items">
        {#each favorites as f (f.id)}
          <li>
            <button class="item-head preview" aria-pressed={previewId === f.id} title="Voir sur le mur" onclick={() => preview(f.id)}>
              {#if f.block.route}<span class="dot" style:background={f.block.route.colorHex}></span>{/if}
              <span class="item-info">
                <strong>{f.title}</strong>
                <small>{f.title === blockLabel(f.block) ? "" : `${blockLabel(f.block)} · `}cote {f.block.estimatedRating}</small>
                {#if f.comment}<small class="comment">« {f.comment} »</small>{/if}
              </span>
            </button>
            <div class="item-actions">
              <button onclick={() => startFavorites([f.id])}>Grimper</button>
              <details class="edit">
                <summary>Modifier</summary>
                <label class="field">Titre <input type="text" value={f.title} onchange={(e) => app.updateLibrary((l) => updateFavorite(l, f.id, { title: (e.currentTarget as HTMLInputElement).value }))} /></label>
                <label class="field"
                  >Commentaire <input
                    type="text"
                    value={f.comment ?? ""}
                    placeholder="Note ou retour sur ce bloc…"
                    onchange={(e) => app.updateLibrary((l) => updateFavorite(l, f.id, { comment: (e.currentTarget as HTMLInputElement).value }))}
                  /></label
                >
              </details>
              <button class="danger-soft" class:armed={confirmId === f.id} onclick={() => confirmed(f.id) && app.updateLibrary((l) => removeFavorite(l, f.id))}
                >{confirmId === f.id ? "Confirmer" : "Retirer"}</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="row">
      <label class="file">
        <input type="file" accept="application/json,.json" onchange={onImport} />
        <span>Importer de Brlok desktop…</span>
      </label>
      {#if kind === "pan" && favorites.length > 0}<button onclick={exportFavorites}>Exporter pour Brlok desktop</button>{/if}
    </div>
    <p class="hint">Brlok desktop : <code>favorites.json</code> (favoris du pan affiché) ou <code>templates.json</code> (modèles).</p>
  </section>

  <section>
    <h3>Modèles de séance ({templates.length})</h3>
    {#if templates.length === 0}
      <p class="hint">Aucun modèle {kind === "voies" ? "de séance de voies" : "de pan"} : règle une séance, puis « Enregistrer comme modèle ».</p>
    {:else}
      <ul class="items">
        {#each templates as t (t.id)}
          <li>
            {#if renaming === t.id}
              <form
                class="row"
                onsubmit={(e) => {
                  e.preventDefault();
                  const next = renameTemplate(app.library, t.id, renameText);
                  if (next === app.library && renameText.trim() !== t.name) {
                    message = renameText.trim() ? `Un autre modèle s'appelle déjà « ${renameText.trim()} ».` : "Le nom ne peut pas être vide.";
                    return;
                  }
                  app.setLibrary(next);
                  renaming = null;
                }}
              >
                <input type="text" bind:value={renameText} aria-label="Nouveau nom du modèle" />
                <button class="primary" type="submit">Renommer</button>
                <button type="button" onclick={() => (renaming = null)}>Annuler</button>
              </form>
            {:else}
              <div class="item-head">
                <span class="item-info">
                  <strong>{t.name}</strong>
                  <small>{settingsText(t.settings)}</small>
                  {#if t.timer}<small>{timerText(t)}</small>{/if}
                </span>
              </div>
              <div class="item-actions">
                <button class="primary" onclick={() => onApplyTemplate(t)}>Utiliser</button>
                <button onclick={() => ((renaming = t.id), (renameText = t.name))}>Renommer</button>
                <button class="danger-soft" class:armed={confirmId === t.id} onclick={() => confirmed(t.id) && app.updateLibrary((l) => removeTemplate(l, t.id))}
                  >{confirmId === t.id ? "Confirmer" : "Supprimer"}</button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Historique</h3>
    <div class="row">
      {#each [[7, "7 jours"], [30, "30 jours"], [null, "Tout"]] as const as [d, text] (text)}
        <button class="chip" aria-pressed={days === d} onclick={() => (days = d)}>{text}</button>
      {/each}
    </div>
    <div class="row">
      <input class="search" type="search" placeholder="Rechercher (mur, prise, voie, commentaire…)" bind:value={search} aria-label="Rechercher dans l'historique" />
      <label class="check"><input type="checkbox" bind:checked={thisWall} /> Ce mur seulement</label>
    </div>
    {#if history.length === 0}
      <p class="hint">{app.library.history.length ? "Aucune séance ne correspond." : "Aucune séance terminée : « Fin de séance » range la séance ici."}</p>
    {:else}
      <ul class="items">
        {#each history as s (s.id)}
          {@const sum = runSummary(s.blocks)}
          <li>
            <details>
              <summary>
                <span class="item-info">
                  <strong>{dateText(s.endedAt)} · {s.wallName}</strong>
                  <small>
                    {s.blocks.length} {s.blocks.some((b) => b.route) ? "voie(s)" : "bloc(s)"}{sum.done ? ` · ${sum.success}/${sum.done} réussi(s)` : ""}{s.templateName
                      ? ` · ${s.templateName}`
                      : ""}{s.playerName ? ` · ${s.playerName}` : ""}
                  </small>
                </span>
              </summary>
              {#if s.settings}<p class="hint">{settingsText(s.settings)}</p>{/if}
              <ol class="record-blocks">
                {#each s.blocks as b, i (i)}
                  <li>
                    <span class="result" class:ok={b.result === "reussi"} class:ko={b.result === "chute"}>{b.result === "reussi" ? "✓" : b.result === "chute" ? "✗" : "·"}</span>
                    {blockLabel(b)}
                    {#if b.comment}<small class="comment">« {b.comment} »</small>{/if}
                  </li>
                {/each}
              </ol>
              <div class="item-actions">
                <button class="primary" onclick={() => reload(s)}>Refaire cette séance</button>
                <select
                  aria-label="Exporter la séance"
                  value=""
                  onchange={(e) => {
                    const el = e.currentTarget as HTMLSelectElement;
                    const format = el.value as ExportFormat;
                    el.value = "";
                    if (format) void exportRecord(s, format);
                  }}
                >
                  <option value="" disabled>Exporter…</option>
                  {#each EXPORT_FORMATS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
                </select>
                <button class="danger-soft" class:armed={confirmId === s.id} onclick={() => confirmed(s.id) && app.updateLibrary((l) => removeFromHistory(l, s.id))}
                  >{confirmId === s.id ? "Confirmer" : "Supprimer"}</button
                >
              </div>
            </details>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .library {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .message {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg);
    font-size: 0.9rem;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .items > li {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .item-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button.preview {
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 0;
    min-height: 0;
    color: inherit;
  }
  button.preview[aria-pressed="true"] strong {
    color: var(--accent);
  }
  summary .item-info {
    display: inline-flex;
    vertical-align: top;
    max-width: calc(100% - 1.5em);
  }
  .item-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .item-info small,
  .record-blocks small {
    color: var(--muted);
    word-break: break-word;
  }
  .comment {
    font-style: italic;
  }
  .item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .item-actions button,
  .item-actions select {
    min-height: 40px;
  }
  .edit {
    flex-basis: 100%;
    order: 3;
  }
  .edit summary,
  details > summary {
    cursor: pointer;
  }
  .edit[open] {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .edit summary {
    font-size: 0.9rem;
    color: var(--accent);
  }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .danger-soft.armed {
    background: #c62828;
    color: #fff;
    border-color: #c62828;
  }
  .chip {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
  }
  .search {
    flex: 1;
    min-width: 180px;
    min-height: 40px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: inherit;
  }
  .record-blocks {
    margin: 0;
    padding-left: 22px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.9rem;
  }
  .result {
    display: inline-block;
    width: 1.2em;
    font-weight: 700;
    color: var(--muted);
  }
  .result.ok {
    color: #2e7d32;
  }
  .result.ko {
    color: #c62828;
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
  code {
    font-size: 0.85em;
  }
</style>
