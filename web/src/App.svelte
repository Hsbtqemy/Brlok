<script lang="ts">
  import { app } from "./lib/appState.svelte";
  import GameScreen from "./lib/GameScreen.svelte";
  import PlayersScreen from "./lib/PlayersScreen.svelte";
  import WallScreen from "./lib/WallScreen.svelte";
  import WallsScreen from "./lib/WallsScreen.svelte";

  const SCREENS = [
    { id: "pan", label: "Grimper" },
    { id: "partie", label: "Partie" },
    { id: "murs", label: "Murs" },
    { id: "joueurs", label: "Joueurs" },
  ] as const;
  type ScreenId = (typeof SCREENS)[number]["id"];

  function initialScreen(): ScreenId {
    try {
      const saved = localStorage.getItem("brlok-web:screen");
      return SCREENS.some((s) => s.id === saved) ? (saved as ScreenId) : "pan";
    } catch {
      return "pan";
    }
  }

  let screen = $state<ScreenId>(initialScreen());
  /** Murs : éditeur du mur actif ouvert (depuis Grimper, « Modifier »). */
  let wallOpen = $state(false);
  function go(id: ScreenId) {
    screen = id;
    try {
      localStorage.setItem("brlok-web:screen", id);
    } catch {
      // sans persistance
    }
  }
</script>

<header>
  <h1>Brlok <span>·</span> Chesscalade</h1>
  <nav>
    {#each SCREENS as s (s.id)}
      <button
        aria-pressed={screen === s.id}
        onclick={() => {
          if (s.id === "murs") wallOpen = false;
          go(s.id);
        }}>{s.label}</button
      >
    {/each}
  </nav>
  <span class="sync" class:shared={app.syncStatus === "partage"} class:error={app.syncStatus === "erreur"} title={app.syncDetail}>
    {app.syncStatus === "partage"
      ? "Données partagées"
      : app.syncStatus === "connexion"
        ? "Connexion…"
        : app.syncStatus === "erreur"
          ? "Synchronisation en échec"
          : "Données sur cet appareil"}
  </span>
  {#if app.ratings.players.length > 0}
    <label class="player">
      Joueur
      <select value={app.activePlayer?.id} onchange={(e) => app.selectPlayer((e.currentTarget as HTMLSelectElement).value)}>
        {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </label>
  {/if}
</header>

<main>
  {#if screen === "pan"}
    <WallScreen
      onEdit={() => {
        wallOpen = !!app.wall;
        go("murs");
      }}
    />
  {:else if screen === "murs"}
    <WallsScreen bind:open={wallOpen} />
  {:else if screen === "partie"}
    <GameScreen />
  {:else}
    <PlayersScreen />
  {/if}
</main>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-block: 12px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  h1 span {
    color: var(--accent);
  }
  nav {
    display: flex;
    gap: 6px;
  }
  .sync {
    font-size: 0.8rem;
    color: var(--muted);
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
  }
  .sync.shared {
    color: #2e7d32;
    border-color: #2e7d32;
  }
  .sync.error {
    color: #c62828;
    border-color: #c62828;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
  }
  @media (max-width: 600px) {
    header {
      gap: 8px;
      padding-block: 8px;
    }
    h1 {
      font-size: 1.15rem;
    }
    nav {
      order: 3;
      width: 100%;
    }
    nav button {
      flex: 1;
      min-height: 40px;
    }
    .sync {
      font-size: 0.7rem;
      padding: 2px 8px;
    }
  }
  main {
    padding-block: 0 24px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
</style>
