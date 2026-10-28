<script lang="ts">
  import { createPlayer, removePlayer, type RatingKind } from "../core/players";
  import { app } from "./appState.svelte";
  import DataPanel from "./DataPanel.svelte";
  import PlacementPanel from "./PlacementPanel.svelte";

  const KINDS: { id: RatingKind; label: string }[] = [
    { id: "grimpe", label: "Grimpe" },
    { id: "echecs", label: "Échecs" },
    { id: "chesscalade", label: "Chesscalade" },
  ];

  let name = $state("");
  /** Suppression en deux temps (pas de boîte de dialogue : elle n'est pas disponible partout). */
  let confirmDelete = $state<string | null>(null);
  let placing = $state<string | null>(null);

  function add() {
    if (!name.trim()) return;
    const state = createPlayer($state.snapshot(app.ratings), name);
    app.setRatings(state);
    app.selectPlayer(state.players.at(-1)!.id);
    name = "";
  }

  function remove(id: string) {
    if (confirmDelete !== id) {
      confirmDelete = id;
      return;
    }
    confirmDelete = null;
    app.setRatings(removePlayer($state.snapshot(app.ratings), id));
    if (app.activePlayerId === id) app.selectPlayer(null);
  }

  const nameOf = (id: string) =>
    app.ratings.players.find((p) => p.id === id)?.name ?? (id.startsWith("stockfish-") ? `Stockfish ${id.slice(10)}` : id ? "?" : "Invité");
  const date = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
</script>

<div class="screen">
  {#if placing}
    <section class="panel">
      <PlacementPanel playerId={placing} onClose={() => (placing = null)} />
    </section>
  {/if}
  <section class="panel">
    <h2>Joueurs</h2>
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input type="text" placeholder="Nom" bind:value={name} aria-label="Nom du joueur" />
      <button class="primary" type="submit">Ajouter</button>
    </form>

    {#if app.ratings.players.length === 0}
      <p class="hint">Aucun joueur. Chaque joueur a trois cotes (grimpe, échecs, Chesscalade), qui partent de 1500.</p>
    {:else}
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Joueur</th>
            {#each KINDS as k (k.id)}<th>{k.label}</th>{/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each app.ratings.players as p (p.id)}
            <tr class:active={app.activePlayer?.id === p.id}>
              <td>
                <div class="who">
                  <button class="name" onclick={() => app.selectPlayer(p.id)} aria-pressed={app.activePlayer?.id === p.id}>{p.name}</button>
                  <button class="place" class:todo={!p.placedAt} onclick={() => (placing = p.id)} disabled={placing !== null}>
                    {p.placedAt ? "Refaire le placement" : "Placement"}
                  </button>
                </div>
              </td>
              {#each KINDS as k (k.id)}
                <td class="num">
                  {Math.round(p.ratings[k.id].rating)}
                  <span class="rd">±{Math.round(p.ratings[k.id].rd * 2)}</span>
                </td>
              {/each}
              <td class="actions">
                <button class="remove" class:armed={confirmDelete === p.id} onclick={() => remove(p.id)} aria-label={`Supprimer ${p.name}`}>
                  {confirmDelete === p.id ? "Supprimer ?" : "✕"}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
      <p class="hint">Placement : 5 blocs pour fixer la cote de grimpe de départ, à faire une fois. Le joueur sélectionné enregistre les tentatives de l'onglet Pan. « ± » : incertitude de la cote, qui diminue avec le nombre de blocs et de parties.</p>
    {/if}
  </section>

  <section class="panel">
    <h2>Journal des blocs</h2>
    {#if app.ratings.attempts.length === 0}
      <p class="hint">Aucune tentative enregistrée.</p>
    {:else}
      <ul class="journal">
        {#each app.ratings.attempts.slice(0, 40) as a, i (a.at + i)}
          <li>
            <span class="badge" class:ok={a.success}>{a.success ? "Réussi" : "Chute"}</span>
            <span><strong>{nameOf(a.playerId)}</strong> · {a.holds.join("→")}</span>
            <span class="hint">
              {date(a.at)} · bloc {a.blockRating} · {a.ratingBefore} → {a.ratingAfter}{a.context === "partie" ? " · en partie" : a.context === "placement" ? " · placement" : ""}{a.feet ? ` · pieds : ${a.feet}` : ""}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <h2>Parties</h2>
    {#if app.ratings.games.length === 0}
      <p class="hint">Aucune partie terminée.</p>
    {:else}
      <ul class="journal">
        {#each app.ratings.games.slice(0, 20) as g, i (g.at + i)}
          <li>
            <span><strong>{nameOf(g.white)}</strong> – <strong>{nameOf(g.black)}</strong> : {g.score === 1 ? "1-0" : g.score === 0 ? "0-1" : "½-½"} ({g.reason})</span>
            <span class="hint">{date(g.at)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
  <section class="panel">
    <DataPanel />
  </section>
</div>

<style>
  .screen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
  }
  form input {
    flex: 1;
    min-width: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 6px 4px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rd {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .name {
    min-height: 36px;
    padding: 0 10px;
    font-weight: 600;
  }
  .table-wrap {
    overflow-x: auto;
  }
  .who {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .actions {
    text-align: right;
  }
  .place {
    min-height: 30px;
    padding: 0 8px;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .place.todo {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .remove {
    min-height: 36px;
    padding: 0 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .remove.armed {
    color: #fff;
    background: #c62828;
    border-color: #c62828;
  }
  .journal {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .journal li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
  }
  .badge {
    align-self: flex-start;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
    background: #c62828;
    color: #fff;
  }
  .badge.ok {
    background: #2e7d32;
  }
</style>
