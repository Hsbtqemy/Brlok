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

  /** État des données : en entier sur grand écran, en un mot sur téléphone. */
  const SYNC_TEXT = {
    partage: { long: "Données partagées", short: "Partagé" },
    connexion: { long: "Connexion…", short: "…" },
    erreur: { long: "Synchronisation en échec", short: "Échec synchro" },
    local: { long: "Données sur cet appareil", short: "Local" },
  } as const;
  const sync = $derived(SYNC_TEXT[app.syncStatus]);

  // Thème : automatique (celui de l'appareil), jour ou nuit, retenu sur cet appareil.
  type Theme = "auto" | "light" | "dark";
  const THEMES: { id: Theme; icon: string; label: string }[] = [
    { id: "auto", icon: "◐", label: "Thème : automatique (celui de l'appareil)" },
    { id: "light", icon: "☀", label: "Thème : jour" },
    { id: "dark", icon: "☾", label: "Thème : nuit" },
  ];
  let theme = $state<Theme>(readTheme());
  function readTheme(): Theme {
    try {
      const saved = localStorage.getItem("brlok-web:theme");
      return saved === "light" || saved === "dark" ? saved : "auto";
    } catch {
      return "auto";
    }
  }
  const themeInfo = $derived(THEMES.find((t) => t.id === theme)!);
  function nextTheme() {
    theme = THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id;
  }
  $effect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem("brlok-web:theme", theme);
    } catch {
      // sans persistance
    }
  });

  // Barre de navigation en bas : sur téléphone, et sur tablette tactile (iPad), à portée de pouce.
  const BOTTOM_NAV = "(max-width: 600px), (pointer: coarse) and (max-width: 1400px)";
  $effect(() => {
    const query = window.matchMedia(BOTTOM_NAV);
    const apply = () => document.body.classList.toggle("bottom-nav", query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  });

  // Installation de l'app (Android, Chrome et Edge sur ordinateur) : le navigateur la propose, on garde
  // l'invitation pour un bouton. Sur iPhone : Partager → Sur l'écran d'accueil.
  type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
  let installPrompt = $state<InstallPrompt | null>(null);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => (installPrompt = null));
  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
  }
  /** Murs : éditeur du mur actif ouvert (depuis Grimper, « Modifier »). */
  // Retenu d'un chargement à l'autre : sur Android, la page peut être rechargée pendant que l'appareil
  // photo est ouvert ; on revient alors sur le mur en cours plutôt que sur la liste.
  let wallOpen = $state(readWallOpen());
  function readWallOpen(): boolean {
    try {
      return localStorage.getItem("brlok-web:wall-open") === "1";
    } catch {
      return false;
    }
  }
  $effect(() => {
    try {
      localStorage.setItem("brlok-web:wall-open", wallOpen ? "1" : "0");
    } catch {
      // sans persistance
    }
  });
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
  {#if installPrompt}<button class="install" onclick={install}>Installer l'app</button>{/if}
  <button class="theme" onclick={nextTheme} title={themeInfo.label} aria-label={themeInfo.label}>
    <span aria-hidden="true">{themeInfo.icon}</span><span class="theme-name">{theme === "auto" ? "Auto" : theme === "light" ? "Jour" : "Nuit"}</span>
  </button>
  <span class="sync" class:shared={app.syncStatus === "partage"} class:error={app.syncStatus === "erreur"} title={app.syncDetail || sync.long}>
    <span class="long">{sync.long}</span><span class="short">{sync.short}</span>
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
    padding-top: max(12px, env(safe-area-inset-top, 0px));
    padding-bottom: 12px;
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
  .theme {
    min-height: 32px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    border-radius: 999px;
  }
  /* Navigation en bas : le bouton de thème va à droite de l'en-tête, avant l'état des données. */
  :global(body.bottom-nav) .theme {
    margin-left: auto;
  }
  .theme span:first-child {
    font-size: 1.05rem;
  }
  .install {
    min-height: 32px;
    padding: 0 12px;
    font-size: 0.85rem;
    border-color: var(--accent);
    color: var(--accent);
  }
  .sync .short {
    display: none;
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
      padding-top: max(8px, env(safe-area-inset-top, 0px));
      padding-bottom: 8px;
    }
    h1 {
      font-size: 1.15rem;
    }
    .sync {
      font-size: 0.7rem;
      padding: 2px 8px;
    }
    .theme-name {
      display: none;
    }
    .sync .long {
      display: none;
    }
    .sync .short {
      display: inline;
    }
    .theme {
      padding: 0 8px;
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
  /* Téléphone et tablette tactile : la navigation passe en barre fixe en bas, à portée de pouce. */
  :global(body.bottom-nav) nav {
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
    justify-content: center;
  }
  :global(body.bottom-nav) nav button {
    flex: 1;
    max-width: 180px;
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
  :global(body.bottom-nav) nav button[aria-pressed="true"] {
    border-color: transparent;
    color: var(--accent);
    font-weight: 700;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  :global(body.bottom-nav) nav .icon {
    display: block;
  }
  :global(body.bottom-nav.climbing) nav {
    display: none;
  }
  main {
    padding-block: 0 calc(24px + var(--nav-h));
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
</style>
