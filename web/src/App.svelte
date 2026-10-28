<script lang="ts">
  import { app } from "./lib/appState.svelte";
  import GameScreen from "./lib/GameScreen.svelte";
  import PlayersScreen from "./lib/PlayersScreen.svelte";
  import WallScreen from "./lib/WallScreen.svelte";
  import WallsScreen from "./lib/WallsScreen.svelte";

  const SCREENS = [
    // Icônes (24 × 24, trait) : prise, cavalier, grille de mur, joueur.
    { id: "pan", label: "Grimper", icon: "M7 20c-2-3-2-7 1-10s7-4 9-2 1 6-2 9-6 5-8 3Z M10 14a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0" },
    { id: "partie", label: "Partie", icon: "M7 20h11 M8 20c0-3 1-5 3-7-2 0-4 1-5 0-1-2 2-5 4-7l1-2 1 2c3 1 5 4 5 8 0 2-1 4-1 6" },
    { id: "murs", label: "Murs", icon: "M4 4h16v16H4Z M4 9.3h16 M4 14.6h16 M9.3 4v16 M14.6 4v16" },
    { id: "joueurs", label: "Joueurs", icon: "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z M4 21c0-4 4-6 8-6s8 2 8 6" },
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
        }}
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={s.icon} /></svg><span>{s.label}</span></button
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
    /* Téléphone : la navigation passe en barre fixe en bas, à portée de pouce. */
    nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 20;
      gap: 0;
      padding: 4px max(8px, env(safe-area-inset-left, 0px)) calc(4px + env(safe-area-inset-bottom, 0px));
      background: var(--surface);
      border-top: 1px solid var(--border);
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
    }
    nav button {
      flex: 1;
      min-height: 52px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 0;
      border: none;
      background: none;
      border-radius: 10px;
      font-size: 0.75rem;
      color: var(--muted);
    }
    nav button[aria-pressed="true"] {
      border-color: transparent;
      color: var(--accent);
      font-weight: 700;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    nav .icon {
      display: block;
    }
    :global(body.climbing) nav {
      display: none;
    }
    .sync {
      font-size: 0.7rem;
      padding: 2px 8px;
    }
  }
  .icon {
    display: none;
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  main {
    padding-block: 0 calc(24px + var(--nav-h));
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
</style>
