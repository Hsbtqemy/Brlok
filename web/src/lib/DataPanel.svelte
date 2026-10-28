<script lang="ts">
  import { describeBackup, makeBackup, parseBackup, type Backup } from "../core/backup";
  import type { RatingsState } from "../core/players";
  import type { Wall } from "../core/wall";
  import { app, type LiveGame } from "./appState.svelte";
  import { saveFile } from "./fileSave";

  /** Sauvegarde complète : l'exporter, la remettre (sur un autre appareil, ou dans l'app installée). */
  let message = $state("");
  let pending = $state<Backup | null>(null);
  let busy = $state(false);

  async function exportAll() {
    busy = true;
    message = "";
    try {
      const backup = makeBackup($state.snapshot(app.walls) as Wall[], $state.snapshot(app.ratings) as RatingsState, app.liveGame);
      const day = new Date().toISOString().slice(0, 10);
      const result = await saveFile(`brlok-sauvegarde-${day}.json`, JSON.stringify(backup));
      message = result === "saved" ? `Sauvegarde enregistrée : ${describeBackup(backup)}.` : "Enregistrement annulé.";
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      pending = parseBackup(await file.text());
      message = "";
    } catch (e) {
      pending = null;
      message = e instanceof Error ? e.message : String(e);
    }
  }

  function restore() {
    if (!pending) return;
    const b = pending;
    app.setWalls(b.walls, b.walls[0]?.id);
    app.setRatings(b.ratings);
    app.saveGame(b.liveGame as LiveGame | null);
    message = `Données remises : ${describeBackup(b)}.`;
    pending = null;
  }
</script>

<h2>Données de l'app</h2>
<p class="hint">
  Une sauvegarde contient tout : murs et photos, joueurs, cotes, journal, partie en cours. Pour passer d'un appareil à l'autre, ou
  de la page claude.ai à l'app installée : enregistre-la ici, puis remets-la là-bas.
</p>
<div class="row">
  <button class="primary" disabled={busy} onclick={exportAll}>Enregistrer une sauvegarde</button>
  <label class="file">
    <input type="file" accept="application/json,.json" onchange={onFile} />
    <span>Remettre une sauvegarde…</span>
  </label>
</div>
{#if pending}
  <div class="confirm">
    <p>
      Sauvegarde du {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "?"} :
      {describeBackup(pending)}.
    </p>
    <p class="warn">Elle remplace toutes les données actuelles de cet appareil{app.syncStatus === "partage" ? " (et celles partagées avec la page)" : ""}.</p>
    <div class="row">
      <button class="danger" onclick={restore}>Remplacer les données</button>
      <button onclick={() => (pending = null)}>Annuler</button>
    </div>
  </div>
{/if}
{#if message}<p class="message">{message}</p>{/if}

<style>
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
  .confirm {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: 10px;
    border: 2px solid #c62828;
  }
  .confirm p {
    margin: 0;
  }
  .danger {
    background: #c62828;
    border-color: #c62828;
    color: #fff;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
</style>
