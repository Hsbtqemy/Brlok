<script lang="ts">
  import { app } from "./lib/appState.svelte";
  import GameScreen from "./lib/GameScreen.svelte";
  import PlayersScreen from "./lib/PlayersScreen.svelte";
  import WallScreen from "./lib/WallScreen.svelte";

  const SCREENS = [
    { id: "pan", label: "Pan" },
    { id: "partie", label: "Partie" },
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
      <button aria-pressed={screen === s.id} onclick={() => go(s.id)}>{s.label}</button>
    {/each}
  </nav>
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
    <WallScreen />
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
  .player {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
  }
  main {
    padding-block: 0 24px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
</style>
