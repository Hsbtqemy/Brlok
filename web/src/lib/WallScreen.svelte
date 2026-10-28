<script lang="ts">
  import { DISTRIBUTION_PATTERNS, type DistributionPattern } from "../core/distribution";
  import { generateClassicSession, type Block } from "../core/generator";
  import { FOOT_RULES, type FootRule } from "../core/feet";
  import { PIECES, type Piece } from "../core/pieces";
  import { seededRng } from "../core/random";
  import { app } from "./appState.svelte";
  import PanView from "./PanView.svelte";
  import IntervalTimer from "./IntervalTimer.svelte";
  import RouteView from "./RouteView.svelte";
  import { activeRoutes, gradeToRating, ROUTE_VARIANTS, routeBlock, routeHex, routeLabel, routeLogs, variantText, type RouteVariant } from "../core/gym";
  import type { Route } from "../core/wall";
  import { expressWall } from "../core/wallEdit";
  import { loadRouteVariants, saveRouteVariants } from "./storage";
  import LibraryPanel from "./LibraryPanel.svelte";
  import { HOLD_TYPES } from "../core/wallEdit";
  import { TIMER_PRESETS } from "../core/intervals";
  import {
    addFavorite,
    addToHistory,
    blockSignature,
    endRun,
    favoriteTitle,
    LEVEL_PROFILES,
    levelLabel,
    markRated,
    removeFavorite,
    restartRun,
    runHasProgress,
    runSummary,
    saveTemplate,
    selectBlock,
    setBlockComment,
    setBlockResult,
    startRun,
    toggleBlockHold,
    type BlockResult,
    type Library,
    type SessionRun,
    type SessionSettings,
    type SessionTemplate,
    type TimerSettings,
  } from "../core/library";
  import { EXPORT_FORMATS, exportSession, type ExportFormat } from "./sessionFiles";

  interface Props {
    /** Ouvrir le mur actif dans l'onglet Murs. */
    onEdit: () => void;
  }

  let { onEdit }: Props = $props();

  // Aucun mur : pan rapide créé sur place (même nom que celui du lancement de partie, pour le réutiliser).
  let quickCols = $state(6);
  let quickRows = $state(7);
  function createQuick() {
    const cols = Math.max(2, Math.min(26, Math.round(quickCols)));
    const rows = Math.max(2, Math.min(30, Math.round(quickRows)));
    const wall = expressWall(`Pan rapide ${cols}×${rows}`, rows, cols);
    app.setWalls([...app.walls, wall], wall.id);
  }

  /** Variantes de voie permises : le même réglage que pour les parties. */
  let routeVariants = $state<RouteVariant[]>(loadRouteVariants());
  let withVariants = $state(true);

  function toggleVariant(id: RouteVariant) {
    routeVariants = routeVariants.includes(id) ? routeVariants.filter((v) => v !== id) : [...routeVariants, id];
    saveRouteVariants(routeVariants);
  }

  const isGym = $derived(app.wall?.kind === "voies");
  const currentRoute = $derived.by(() => {
    const id = currentBlock?.route?.id;
    return id ? (app.wall?.routes.find((r) => r.id === id) ?? null) : null;
  });


  /** Séance en cours (gardée d'un onglet à l'autre) : celle du mur affiché seulement. */
  const run = $derived(app.library.current && app.library.current.wallId === app.wall?.id ? app.library.current : null);

  // Une séance en cours sur ce mur : on y revient directement.
  let mode = $state<"chesscalade" | "classique" | "carnet" | "bibliotheque">(
    app.library.current && app.library.current.wallId === app.wall?.id ? "classique" : "chesscalade",
  );

  // Chesscalade
  /** Pièce facultative : sans pièce, simplement un bloc (ou une voie) à la cote visée. */
  let piece = $state<Piece | null>("cavalier");
  let targetRating = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1500));
  let length = $state(6);
  let cruxLast = $state(false);
  let feet = $state<FootRule>("libres");
  let chessBlock = $state<Block | null>(null);
  let generationFailed = $state(false);
  const usage = new Map<string, number>();

  // Brlok classique
  let classicLevel = $state(3);
  let classicHolds = $state(8);
  let classicBlocks = $state(5);
  let classicPattern = $state<DistributionPattern>("uniforme");
  let classicVariety = $state(true);
  /** Types de prises exigés ou exclus (Brlok desktop : tags « forcer » et « filtrer »). */
  let requiredTags = $state<string[]>([]);
  let excludedTags = $state<string[]>([]);
  /** Niveau bloc par bloc, venu d'un modèle de Brlok desktop ; effacé dès qu'on change le niveau. */
  let blockLevels = $state<number[] | undefined>(undefined);
  /** Réglages du minuteur (un modèle les garde avec la séance). */
  let timer = $state<TimerSettings>({ preset: TIMER_PRESETS[0].id, config: { ...TIMER_PRESETS[0].config }, chained: false, pauseS: 0 });
  /** Dernier modèle repris : son nom suit la séance tant que ses réglages n'ont pas été changés. */
  let appliedTemplate = $state<SessionTemplate | null>(null);
  let sessionMessage = $state("");
  /** Favori montré sur le mur depuis la bibliothèque. */
  let previewBlock = $state<Block | null>(null);
  let sessionFailed = $state(false);
  /** Modifier la séquence du bloc affiché en touchant le pan. */
  let editing = $state(false);
  let templateName = $state("");
  let savingTemplate = $state(false);

  /** Types de prises présents sur le pan (types connus d'abord). */
  const wallTags = $derived.by(() => {
    const tags = new Set(app.wall?.holds.flatMap((h) => h.tags) ?? []);
    const known = HOLD_TYPES.filter((t) => tags.has(t));
    return [...known, ...[...tags].filter((t) => !(HOLD_TYPES as readonly string[]).includes(t)).sort()];
  });

  /** Neutre → exigé → exclu → neutre. */
  function cycleTag(tag: string) {
    if (requiredTags.includes(tag)) {
      requiredTags = requiredTags.filter((t) => t !== tag);
      excludedTags = [...excludedTags, tag];
    } else if (excludedTags.includes(tag)) {
      excludedTags = excludedTags.filter((t) => t !== tag);
    } else {
      requiredTags = [...requiredTags, tag];
    }
  }

  function panSettings(): SessionSettings {
    return {
      kind: "pan",
      level: classicLevel,
      pattern: classicPattern,
      blocks: classicBlocks,
      holds: classicHolds,
      variety: classicVariety,
      requiredTags: [...requiredTags],
      excludedTags: [...excludedTags],
      ...(blockLevels ? { blockLevels: [...blockLevels] } : {}),
    };
  }

  function gymSettings(): SessionSettings {
    return { kind: "voies", target: gymTarget, pattern: gymPattern, count: gymCount, variants: withVariants ? [...routeVariants] : null };
  }

  /** Le modèle repris, s'il correspond encore aux réglages. */
  function templateFor(settings: SessionSettings): string | undefined {
    return appliedTemplate && JSON.stringify(appliedTemplate.settings) === JSON.stringify(settings) ? appliedTemplate.name : undefined;
  }

  function setRun(next: SessionRun | null) {
    app.updateLibrary((l) => ({ ...l, current: next }));
  }

  function updateRun(change: (r: SessionRun) => SessionRun) {
    if (run) setRun(change(run));
  }

  /** Range une séance dans l'historique. */
  function archive(lib: Library, r: SessionRun): Library {
    const wallName = app.walls.find((w) => w.id === r.wallId)?.name ?? "Mur supprimé";
    return addToHistory(lib, endRun(r, wallName, app.activePlayer?.name));
  }

  /** Nouvelle séance ; celle en cours va d'abord à l'historique si l'on y a noté quelque chose. */
  function beginRun(blocks: Block[], settings?: SessionSettings, name?: string) {
    const wall = app.wall;
    if (!wall || blocks.length === 0) return;
    let lib = app.library;
    if (lib.current && runHasProgress(lib.current)) lib = archive(lib, lib.current);
    app.setLibrary({ ...lib, current: startRun(wall.id, blocks, settings, name) });
    lastDelta = null;
    editing = false;
    sessionFailed = false;
    mode = "classique";
  }

  function endSession() {
    if (!run) return;
    app.setLibrary({ ...archive(app.library, run), current: null });
    editing = false;
    lastDelta = null;
    sessionMessage = "Séance rangée dans l'historique (onglet Bibliothèque).";
  }

  function restartSession() {
    if (!run) return;
    const progress = runHasProgress(run);
    const lib = progress ? archive(app.library, run) : app.library;
    app.setLibrary({ ...lib, current: restartRun(run) });
    lastDelta = null;
    sessionMessage = progress ? "Même séance, résultats remis à zéro (la précédente est à l'historique)." : "";
  }

  function pickBlock(index: number) {
    updateRun((r) => selectBlock(r, index));
    lastDelta = null;
  }

  /** Résultat du bloc affiché ; la tentative compte une seule fois pour les cotes. */
  function noteResult(result: BlockResult | null) {
    const r = run;
    if (!r) return;
    const i = r.selected;
    const block = r.blocks[i];
    let next = setBlockResult(r, i, result);
    const player = app.activePlayer;
    if (result && player && !block.rated) {
      lastDelta = app.recordAttempt(player.id, block, result === "reussi", "libre");
      next = markRated(next, i);
    }
    setRun(next);
  }

  function toggleHold(id: string) {
    const wall = app.wall;
    if (!wall) return;
    updateRun((r) => ({ ...r, blocks: r.blocks.map((b, i) => (i === r.selected ? toggleBlockHold(wall, b, id) : b)) }));
  }

  function favoriteOf(block: Block) {
    const wall = app.wall;
    if (!wall) return undefined;
    const sig = blockSignature(wall.id, block);
    return app.library.favorites.find((f) => blockSignature(f.wallId, f.block) === sig);
  }

  function toggleFavorite(block: Block, title: string, comment?: string) {
    const wall = app.wall;
    if (!wall) return;
    const existing = favoriteOf(block);
    app.updateLibrary((l) => (existing ? removeFavorite(l, existing.id) : addFavorite(l, wall.id, block, title, comment).lib));
  }

  function favoriteAll() {
    const wall = app.wall;
    if (!wall || !run) return;
    let lib = app.library;
    let added = 0;
    run.blocks.forEach((b, i) => {
      const r = addFavorite(lib, wall.id, b, favoriteTitle(run.settings, i), b.comment);
      lib = r.lib;
      if (r.added) added++;
    });
    app.setLibrary(lib);
    sessionMessage = added ? `${added} bloc(s) ajouté(s) aux favoris.` : "Tous les blocs de la séance sont déjà en favoris.";
  }

  async function exportRun(format: ExportFormat) {
    if (!run || !app.wall) return;
    try {
      sessionMessage = await exportSession({ ...run, wallName: app.wall.name, playerName: app.activePlayer?.name }, format, app.wall);
    } catch (e) {
      sessionMessage = e instanceof Error ? e.message : String(e);
    }
  }

  /** Remet des réglages de séance dans le formulaire. */
  function loadSettings(s: SessionSettings) {
    if (s.kind === "pan") {
      classicLevel = s.level;
      classicPattern = s.pattern;
      classicBlocks = s.blocks;
      classicHolds = s.holds;
      classicVariety = s.variety;
      requiredTags = [...s.requiredTags];
      excludedTags = [...s.excludedTags];
      blockLevels = s.blockLevels ? [...s.blockLevels] : undefined;
    } else {
      gymTarget = s.target;
      gymPattern = s.pattern;
      gymCount = s.count;
      withVariants = s.variants !== null;
      // Les variantes du modèle valent pour cette séance, sans changer le réglage des parties.
      if (s.variants) routeVariants = [...s.variants];
    }
  }

  function applyTemplate(t: SessionTemplate) {
    loadSettings(t.settings);
    if (t.timer) timer = JSON.parse(JSON.stringify(t.timer)) as TimerSettings;
    appliedTemplate = t;
    sessionFailed = false;
    sessionMessage = `Modèle « ${t.name} » repris : ${isGym ? "Préparer la séance" : "Générer la séance"} pour la lancer.`;
    mode = "classique";
  }

  function saveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const settings = isGym ? gymSettings() : panSettings();
    const replaced = app.library.templates.some((t) => t.name === name && t.settings.kind === settings.kind);
    app.updateLibrary((l) => saveTemplate(l, name, settings, $state.snapshot(timer) as TimerSettings));
    appliedTemplate = app.library.templates.find((t) => t.name === name && t.settings.kind === settings.kind) ?? null;
    savingTemplate = false;
    templateName = "";
    sessionMessage = replaced ? `Modèle « ${name} » mis à jour.` : `Modèle « ${name} » enregistré (onglet Bibliothèque).`;
  }

  const kindTemplates = $derived(app.library.templates.filter((t) => t.settings.kind === (isGym ? "voies" : "pan")));

  /** Bloc affiché, et s'il a déjà été noté (une seule tentative enregistrée par bloc affiché). */
  // Séance de voies et carnet (mur à voies)
  let gymTarget = $state(Math.round(app.activePlayer?.ratings.grimpe.rating ?? 1500));
  let gymCount = $state(6);
  let gymPattern = $state<DistributionPattern>("pyramide");
  let carnetBlock = $state<Block | null>(null);
  let carnetFilter = $state<"toutes" | "a-faire">("toutes");
  const logs = $derived(app.activePlayer && app.wall ? routeLogs(app.ratings.attempts, app.activePlayer.id, app.wall.id) : new Map());
  const carnetRoutes = $derived(
    app.wall && isGym
      ? activeRoutes(app.wall, (r) => app.routeRating(r))
          .filter((c) => carnetFilter === "toutes" || !logs.get(c.route.id)?.successes)
          // Ordre stable (cotation, puis nom) : la liste ne bouge pas quand une cote apprise change.
          .sort((a, b) => gradeToRating(a.route.grade) - gradeToRating(b.route.grade) || routeLabel(a.route).localeCompare(routeLabel(b.route)))
      : [],
  );

  function generateGymSession() {
    const blocks = app.routeSession({
      targetRating: gymTarget,
      count: gymCount,
      pattern: gymPattern,
      step: 100,
      variants: withVariants ? routeVariants : [],
      rng: seededRng(Date.now()),
    });
    sessionMessage = "";
    sessionFailed = blocks.length === 0;
    const settings = gymSettings();
    beginRun(blocks, settings, templateFor(settings));
  }

  function carnetRecord(route: Route, rating: number, success: boolean) {
    const player = app.activePlayer;
    if (!player) return;
    const block = routeBlock(route, rating, null);
    carnetBlock = block;
    lastDelta = app.recordAttempt(player.id, block, success, "libre");
  }

  const currentBlock = $derived(
    mode === "chesscalade" ? chessBlock : mode === "carnet" ? carnetBlock : mode === "classique" ? (run?.blocks[run.selected] ?? null) : previewBlock,
  );
  let recorded = $state<string | null>(null);
  let lastDelta = $state<number | null>(null);
  const currentKey = $derived(
    currentBlock ? `${mode}:${currentBlock.route?.id ?? currentBlock.holds.map((h) => h.id).join("-")}` : null,
  );

  function generateChess() {
    if (!app.wall) return;
    chessBlock = app.challenge({
      piece,
      targetRating,
      length,
      cruxLast,
      feet,
      usage,
      routeVariants: isGym && withVariants ? routeVariants : [],
      rng: seededRng(Date.now()),
    });
    generationFailed = chessBlock === null;
    lastDelta = null;
  }

  function generateClassic() {
    if (!app.wall) return;
    const blocks = generateClassicSession(app.wall, {
      targetLevel: classicLevel,
      blocksCount: classicBlocks,
      holdsPerBlock: classicHolds,
      pattern: classicPattern,
      variety: classicVariety,
      requiredTags,
      excludedTags,
      blockLevels,
      rng: seededRng(Date.now()),
    });
    sessionMessage = "";
    sessionFailed = blocks.length === 0;
    const settings = panSettings();
    beginRun(blocks, settings, templateFor(settings));
  }

  // De retour sur l'écran (autre onglet, rechargement) : le formulaire reprend les réglages de la séance en cours.
  {
    const current = app.library.current;
    if (current?.settings && current.wallId === app.wall?.id && current.settings.kind === app.wall?.kind) loadSettings(current.settings);
  }

  function record(success: boolean) {
    const player = app.activePlayer;
    if (!player || !currentBlock || !currentKey) return;
    lastDelta = app.recordAttempt(player.id, currentBlock, success, "libre");
    recorded = currentKey;
  }
</script>

{#snippet variantsControl()}
        <label class="check"><input type="checkbox" bind:checked={withVariants} /> Avec variantes (pour varier une même voie)</label>
        {#if withVariants}
          <details class="variants">
            <summary>Variantes permises ({routeVariants.length}/{ROUTE_VARIANTS.length})</summary>
            <div class="row">
              {#each ROUTE_VARIANTS as v (v.id)}
                <button class="mini-chip" aria-pressed={routeVariants.includes(v.id)} onclick={() => toggleVariant(v.id)} title={v.description}>
                  {v.label} ({v.bonus > 0 ? "+" : "−"}{Math.abs(v.bonus)}){v.for === "ordre" ? " · numérotées" : ""}
                </button>
              {/each}
            </div>
            <p class="hint">Le même réglage que pour les parties. Une variante n'est choisie que si elle rapproche nettement de la cote visée.</p>
          </details>
        {/if}
{/snippet}

{#snippet templatePick()}
  {#if kindTemplates.length > 0}
    <label class="field">
      Modèle
      <select
        value={appliedTemplate && kindTemplates.some((t) => t.id === appliedTemplate!.id) ? appliedTemplate.id : ""}
        onchange={(e) => {
          const t = kindTemplates.find((x) => x.id === (e.currentTarget as HTMLSelectElement).value);
          if (t) applyTemplate(t);
        }}
      >
        <option value="" disabled>Reprendre un modèle…</option>
        {#each kindTemplates as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

{#snippet templateSave()}
  {#if savingTemplate}
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        saveAsTemplate();
      }}
    >
      <input type="text" bind:value={templateName} placeholder="Nom du modèle" aria-label="Nom du modèle" />
      <button class="primary" type="submit" disabled={!templateName.trim()}>Enregistrer</button>
      <button type="button" onclick={() => (savingTemplate = false)}>Annuler</button>
    </form>
    <p class="hint">Garde ces réglages{isGym ? "" : ", les types de prises"} et ceux du minuteur. Un modèle du même nom est remplacé.</p>
  {:else}
    <button class="link" onclick={() => ((savingTemplate = true), (templateName = appliedTemplate?.name ?? ""))}>Enregistrer ces réglages comme modèle</button>
  {/if}
  {#if sessionFailed}
    <p class="warn">
      {isGym
        ? "Aucune voie en place sur ce mur."
        : requiredTags.length || excludedTags.length
          ? "Aucune prise ne répond à ces types (ou un type est à la fois exigé et exclu) : relâche-les."
          : "Aucune prise de ce niveau sur ce pan."}
    </p>
  {/if}
  {#if sessionMessage && !run}<p class="message" role="status">{sessionMessage}</p>{/if}
{/snippet}

{#snippet runView()}
  {#if run}
    {@const sum = runSummary(run.blocks)}
    {@const sel = run.blocks[run.selected]}
    <div class="run">
      <h3>
        Séance en cours{run.templateName ? ` · ${run.templateName}` : ""}
        <small>{sum.done ? `${sum.success}/${sum.done} réussi(s) · ` : ""}{sum.total} {isGym ? "voie(s)" : "bloc(s)"}</small>
      </h3>
      <ol class={isGym ? "session" : "blocks"}>
        {#each run.blocks as b, i (i)}
          <li>
            <button aria-pressed={run.selected === i} onclick={() => pickBlock(i)}>
              {#if b.result}<span class="mark" class:ok={b.result === "reussi"}>{b.result === "reussi" ? "✓" : "✗"}</span>{/if}
              {#if isGym}
                <span class="dot" style:background={b.route?.colorHex}></span>
                {i + 1}. {b.route?.label}{b.route?.variant ? ` · ${variantText(b.route.variant, b.route.variantHold)?.label}` : ""} · {b.estimatedRating}
              {:else}
                Bloc {i + 1} · {b.estimatedRating}
              {/if}
              {#if b.comment}<span class="has-comment" title="Commenté" aria-label="commenté">✎</span>{/if}
            </button>
          </li>
        {/each}
      </ol>
      {#if sel}
        {#if !sel.route}
          <p class="sequence">{sel.holds.map((h) => h.id).join(" → ")}</p>
        {:else if sel.route.variant}
          {@const v = variantText(sel.route.variant, sel.route.variantHold)}
          <p class="variant"><strong>Voie {run.selected + 1} · {v?.label}</strong> — {v?.description}</p>
        {/if}

        <div class="attempt">
          {#if sel.result}
            <p>
              <strong class:ok-text={sel.result === "reussi"} class:ko-text={sel.result === "chute"}>{sel.result === "reussi" ? "✓ Réussi" : "✗ Chute"}</strong>
              <button class="link" onclick={() => noteResult(null)}>changer</button>
            </p>
            {#if sel.rated && app.activePlayer && lastDelta !== null}
              <p class="hint">
                Cote de grimpe de {app.activePlayer.name} : {lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}
              </p>
            {/if}
          {:else}
            <div class="row two">
              <button class="success" onclick={() => noteResult("reussi")}>Réussi</button>
              <button class="fall" onclick={() => noteResult("chute")}>Chute</button>
            </div>
            <p class="hint">
              {#if !app.activePlayer}
                Noté pour la séance ; crée un joueur (onglet Joueurs) pour que ta cote évolue aussi.
              {:else if sel.rated}
                Tentative déjà comptée pour {app.activePlayer.name} : le résultat change seulement dans la séance.
              {:else}
                Tentative de <strong>{app.activePlayer.name}</strong> (cote de grimpe {Math.round(app.activePlayer.ratings.grimpe.rating)}).
              {/if}
            </p>
          {/if}
          <label class="field">
            Commentaire
            <input
              type="text"
              value={sel.comment ?? ""}
              placeholder={isGym ? "Note ou retour sur cette voie…" : "Note ou retour sur ce bloc…"}
              onchange={(e) => {
                const i = run!.selected;
                updateRun((r) => setBlockComment(r, i, (e.currentTarget as HTMLInputElement).value));
              }}
            />
          </label>
          <div class="row">
            <button class="fav" aria-pressed={!!favoriteOf(sel)} onclick={() => toggleFavorite(sel, favoriteTitle(run!.settings, run!.selected), sel.comment)}
              >{favoriteOf(sel) ? "★ Dans les favoris" : "☆ Favori"}</button
            >
            {#if !isGym}
              <button aria-pressed={editing} onclick={() => (editing = !editing)}>{editing ? "Fin de la modification" : "Modifier la séquence"}</button>
            {/if}
          </div>
        </div>
      {/if}

      <div class="row run-actions">
        <button onclick={favoriteAll}>☆ Toute la séance</button>
        <button onclick={restartSession}>Recommencer</button>
        <select
          aria-label="Exporter la séance"
          value=""
          onchange={(e) => {
            const el = e.currentTarget as HTMLSelectElement;
            const format = el.value as ExportFormat;
            el.value = "";
            if (format) void exportRun(format);
          }}
        >
          <option value="" disabled>Exporter…</option>
          {#each EXPORT_FORMATS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
        </select>
        <button class="primary" onclick={endSession}>Fin de séance</button>
      </div>
      {#if sessionMessage}<p class="message" role="status">{sessionMessage}</p>{/if}
    </div>
  {/if}
{/snippet}

{#if app.walls.length === 0}
  <section class="panel welcome">
    <h2>Pour grimper, il faut un mur</h2>
    <p class="hint">Trois façons de commencer : un pan rapide pour grimper tout de suite, ou décrire ton pan ou ta salle dans l'onglet Murs.</p>
    <div class="welcome-cards">
      <div class="welcome-card">
        <span class="card-icon">⚡</span>
        <strong>Pan rapide</strong>
        <small>Une prise par case, toutes de niveau moyen. Compte les cases de ton pan :</small>
        <div class="row">
          <label class="field">Colonnes <input type="number" min="2" max="26" bind:value={quickCols} /></label>
          <label class="field">Rangées <input type="number" min="2" max="30" bind:value={quickRows} /></label>
        </div>
        <button class="primary" onclick={createQuick}>Créer et grimper</button>
      </div>
      <div class="welcome-card">
        <span class="card-icon">📷</span>
        <strong>Une salle</strong>
        <small>Une photo par secteur, puis les voies : couleur, cotation, prises sur la photo.</small>
        <button onclick={onEdit}>Décrire une salle (Murs)</button>
      </div>
      <div class="welcome-card">
        <span class="card-icon">▦</span>
        <strong>Ton pan, prise par prise</strong>
        <small>Niveaux, types de prises, enchaînements impossibles ; ou ton catalogue Brlok desktop.</small>
        <button onclick={onEdit}>Décrire ou importer (Murs)</button>
      </div>
    </div>
  </section>
{:else}
<div class="screen">
  <section class="panel wall-panel">
    <h2>Grimper</h2>
    {#if app.walls.length > 0 && app.wall}
      <label class="field">
        Pan ou mur
        <select
          value={app.wall.id}
          onchange={(e) => {
            app.selectWall((e.currentTarget as HTMLSelectElement).value);
            chessBlock = null;
            previewBlock = null;
            // Les types de prises et le modèle repris valaient pour l'autre mur.
            requiredTags = [];
            excludedTags = [];
            editing = false;
            sessionMessage = "";
            sessionFailed = false;
          }}
        >
          {#each app.walls as w (w.id)}<option value={w.id}>{w.name}{w.kind === "voies" ? " (salle)" : ""}</option>{/each}
        </select>
      </label>
      <p class="hint">
        {isGym ? `Mur à voies : ${app.wall.routes.filter((r) => !r.archived).length} voie(s) en place.` : `Pan ${app.wall.cols} × ${app.wall.rows} : ${app.wall.holds.length} prises.`}
      </p>
      <button onclick={onEdit}>{isGym ? "Gérer les voies" : "Modifier le pan"} (onglet Murs)</button>
    {:else}
      <p class="hint">Aucun mur : crée-en un dans l'onglet Murs (pan express, mur à voies) ou importe ton catalogue Brlok.</p>
      <button class="primary" onclick={onEdit}>Aller à Murs</button>
    {/if}
  </section>

  <section class="panel pan-panel">
    {#if app.wall && isGym}
      {#if currentRoute}
        <RouteView wall={app.wall} route={currentRoute} variant={currentBlock?.route?.variant} variantHold={currentBlock?.route?.variantHold} />
      {:else if app.wall.sectors?.[0]?.photo}
        {#each app.wall.sectors.filter((x) => x.photo) as sec (sec.id)}
          <figure class="sector-fig">
            <img class="sector" src={sec.photo} alt={`Photo du secteur ${sec.name}`} />
            {#if app.wall.sectors.length > 1}<figcaption>{sec.name}</figcaption>{/if}
          </figure>
        {/each}
        <p class="hint">Choisis une voie à droite.</p>
      {:else}
        <p class="empty">{app.wall.routes.length ? "Choisis une voie à droite." : "Aucune voie : ajoute-les avec « Gérer les voies »."}</p>
      {/if}
    {:else if app.wall}
      {#if editing && mode === "classique" && run}
        <p class="editing-hint">Touche une prise pour l'ajouter à la fin du bloc, ou pour la retirer.</p>
      {/if}
      <PanView wall={app.wall} sequence={currentBlock?.holds.map((h) => h.id) ?? []} onHold={editing && mode === "classique" && run ? toggleHold : undefined} />
    {:else}
      <p class="empty">Aucun mur : <button class="link" onclick={onEdit}>crée-en un dans l'onglet Murs</button>.</p>
    {/if}
  </section>

  <section class="panel gen-panel">
    <div class="tabs">
      <button aria-pressed={mode === "chesscalade"} onclick={() => (mode = "chesscalade")}>Chesscalade</button>
      <button aria-pressed={mode === "classique"} onclick={() => (mode = "classique")}>{isGym ? "Séance" : "Brlok classique"}</button>
      {#if isGym}<button aria-pressed={mode === "carnet"} onclick={() => (mode = "carnet")}>Carnet</button>{/if}
      <button aria-pressed={mode === "bibliotheque"} onclick={() => ((mode = "bibliotheque"), (editing = false), (previewBlock = null))}>Bibliothèque</button>
    </div>

    {#if mode === "bibliotheque"}
      <LibraryPanel onStart={(blocks, settings, name) => beginRun(blocks, settings, name)} onApplyTemplate={applyTemplate} onPreview={(b) => (previewBlock = b)} />
    {:else if mode === "carnet" && isGym}
      <h2>Carnet de voies</h2>
      <div class="row">
        <button aria-pressed={carnetFilter === "toutes"} onclick={() => (carnetFilter = "toutes")}>Toutes</button>
        <button aria-pressed={carnetFilter === "a-faire"} onclick={() => (carnetFilter = "a-faire")}>Pas encore réussies</button>
      </div>
      {#if !app.activePlayer}
        <p class="hint">Crée un joueur (onglet Joueurs) pour tenir ton carnet.</p>
      {/if}
      <ul class="carnet">
        {#each carnetRoutes as c (c.route.id)}
          {@const log = logs.get(c.route.id)}
          <li class:selected={carnetBlock?.route?.id === c.route.id}>
            <button class="carnet-route" onclick={() => (carnetBlock = routeBlock(c.route, c.rating, null))}>
              <span class="dot" style:background={routeHex(c.route)}></span>
              <span class="carnet-info">
                <strong>{routeLabel(c.route)}</strong>
                <span class="hint">
                  cote {Math.round(c.rating)} ·
                  {#if log?.successes}réussie ({log.successes}/{log.attempts}){:else if log}{log.attempts} essai(s){:else}pas encore tentée{/if}
                </span>
              </span>
              {#if log?.successes}<span class="done" aria-label="Réussie">✓</span>{/if}
            </button>
            {#if app.activePlayer}
              <div class="carnet-actions">
                <button class="mini ok" onclick={() => carnetRecord(c.route, c.rating, true)}>Réussi</button>
                <button class="mini ko" onclick={() => carnetRecord(c.route, c.rating, false)}>Raté</button>
              </div>
            {/if}
          </li>
        {:else}
          <li class="hint">{carnetFilter === "a-faire" ? "Toutes les voies en place sont réussies." : "Aucune voie en place."}</li>
        {/each}
      </ul>
      {#if lastDelta !== null && carnetBlock && app.activePlayer}
        <p class="hint">Cote de grimpe : {lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}</p>
      {/if}
    {:else if mode === "chesscalade"}
      <h2>{isGym ? "Choisir une voie" : "Bloc-défi"}</h2>
      {#if isGym}<p class="hint">La voie en place la plus proche de la cote visée, de préférence au style de la pièce.</p>{/if}
      <div class="pieces">
        {#each PIECES as p (p.id)}
          <button aria-pressed={piece === p.id} onclick={() => (piece = p.id)} title={p.character}>
            <span class="symbol">{p.symbol}</span>{p.label}
          </button>
        {/each}
        <button aria-pressed={piece === null} onclick={() => (piece = null)} title="Sans pièce : juste la cote visée">
          <span class="symbol">—</span>Aucune
        </button>
      </div>
      <p class="hint">{piece ? PIECES.find((p) => p.id === piece)?.character : "Sans pièce : simplement à la cote visée."}</p>
      <label class="field">
        <span>
          Cote visée : <strong>{targetRating}</strong>
          {#if app.activePlayer}
            <button class="link" onclick={() => (targetRating = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
          {/if}
        </span>
        <input type="range" min="800" max="2300" step="50" bind:value={targetRating} />
      </label>
      {#if !isGym}
      <label class="field">
        Nombre de prises
        <input type="number" min="3" max="12" bind:value={length} />
      </label>
      <label class="check"><input type="checkbox" bind:checked={cruxLast} /> Crux en dernier (prise d'une pièce)</label>
      <label class="field">
        Pieds
        <select bind:value={feet}>
          {#each FOOT_RULES as r (r.id)}<option value={r.id}>{r.label}{r.bonus ? ` (+${r.bonus})` : ""}</option>{/each}
        </select>
      </label>
      {/if}
      {#if isGym}{@render variantsControl()}{/if}
      <button class="primary" disabled={!app.wall} onclick={generateChess}>{isGym ? "Choisir" : "Générer"}</button>

      {#if chessBlock}
        <div class="result">
          <p class="sequence">{chessBlock.route ? chessBlock.route.label : chessBlock.holds.map((h) => h.id).join(" → ")}</p>
          <p>Cote estimée : <strong>{chessBlock.estimatedRating}</strong></p>
          {#if chessBlock.route?.variant}
            {@const v = variantText(chessBlock.route.variant, chessBlock.route.variantHold)}
            <p class="variant"><strong>Variante : {v?.label}</strong> — {v?.description}</p>
          {/if}
          {#if chessBlock.feet}
            <p class="hint">
              {FOOT_RULES.find((r) => r.id === chessBlock!.feet)?.label}
              {#if chessBlock.noFootMove}: sans pied de {chessBlock.holds[chessBlock.noFootMove - 1]?.id} à {chessBlock.holds[chessBlock.noFootMove]?.id}{/if}
            </p>
          {/if}
          {#if chessBlock.relaxations.length > 0}
            <p class="warn">Assoupli : {chessBlock.relaxations.join(", ")}.</p>
          {/if}
          <button
            class="fav"
            aria-pressed={!!favoriteOf(chessBlock)}
            onclick={() =>
              toggleFavorite(
                chessBlock!,
                `${piece ? PIECES.find((p) => p.id === piece)?.label : isGym ? "Voie" : "Bloc"} · ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
              )}>{favoriteOf(chessBlock) ? "★ Dans les favoris" : "☆ Ajouter aux favoris"}</button
          >
        </div>
      {:else if generationFailed}
        <p class="warn">Aucun bloc possible sur ce pan.</p>
      {/if}
    {:else if isGym}
      <h2>Séance de voies</h2>
      {@render templatePick()}
      <label class="field">
        <span>
          Autour de la cote : <strong>{gymTarget}</strong>
          {#if app.activePlayer}
            <button class="link" onclick={() => (gymTarget = Math.round(app.activePlayer!.ratings.grimpe.rating))}>ma cote</button>
          {/if}
        </span>
        <input type="range" min="800" max="2300" step="50" bind:value={gymTarget} />
      </label>
      <label class="field">
        Répartition
        <select bind:value={gymPattern}>
          {#each DISTRIBUTION_PATTERNS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">Voies <input type="number" min="1" max="20" bind:value={gymCount} /></label>
      {@render variantsControl()}
      <button class="primary" disabled={!app.wall} onclick={generateGymSession}>Préparer la séance</button>
      {@render templateSave()}
      {@render runView()}
    {:else}
      <h2>Séance</h2>
      {@render templatePick()}
      <label class="field">
        Difficulté
        <select bind:value={classicLevel} onchange={() => (blockLevels = undefined)}>
          {#each LEVEL_PROFILES as p (p.level)}<option value={p.level}>{p.label}</option>{/each}
        </select>
      </label>
      {#if blockLevels}
        <p class="hint">
          Niveau bloc par bloc (modèle) : {blockLevels.map(levelLabel).join(" / ")}
          <button class="link" onclick={() => (blockLevels = undefined)}>le même pour tous</button>
        </p>
      {/if}
      <label class="field">
        Répartition
        <select bind:value={classicPattern}>
          {#each DISTRIBUTION_PATTERNS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="field">Blocs <input type="number" min="1" max="20" bind:value={classicBlocks} oninput={() => (blockLevels = undefined)} /></label>
      <label class="field">Prises par bloc <input type="number" min="1" max="20" bind:value={classicHolds} /></label>
      <label class="check"><input type="checkbox" bind:checked={classicVariety} /> Variété</label>
      <details class="tags" open={requiredTags.length + excludedTags.length > 0}>
        <summary>
          Types de prises{requiredTags.length || excludedTags.length
            ? ` : ${[requiredTags.length ? `que ${requiredTags.join(", ")}` : "", excludedTags.length ? `sans ${excludedTags.join(", ")}` : ""].filter(Boolean).join(" · ")}`
            : ""}
        </summary>
        {#if wallTags.length === 0}
          <p class="hint">Aucun type de prise renseigné sur ce pan : on les donne dans l'éditeur du pan (onglet Murs).</p>
        {:else}
          <p class="hint">Toucher un type : ✓ seulement des prises de ce type (au moins un des types cochés), puis ✕ aucune prise de ce type, puis neutre.</p>
          <div class="row">
            {#each wallTags as t (t)}
              <button
                class="mini-chip"
                class:required={requiredTags.includes(t)}
                class:excluded={excludedTags.includes(t)}
                aria-label={`${t} : ${requiredTags.includes(t) ? "exigé" : excludedTags.includes(t) ? "exclu" : "indifférent"}`}
                onclick={() => cycleTag(t)}>{requiredTags.includes(t) ? "✓ " : excludedTags.includes(t) ? "✕ " : ""}{t}</button
              >
            {/each}
          </div>
        {/if}
      </details>
      <button class="primary" disabled={!app.wall} onclick={generateClassic}>Générer la séance</button>
      {@render templateSave()}
      {@render runView()}
    {/if}

    {#if currentBlock && mode === "chesscalade"}
      <div class="attempt">
        {#if app.activePlayer}
          {#if recorded === currentKey}
            <p>
              Tentative enregistrée pour {app.activePlayer.name}
              {#if lastDelta !== null}({lastDelta >= 0 ? "+" : ""}{Math.round(lastDelta)} → {Math.round(app.activePlayer.ratings.grimpe.rating)}){/if}.
            </p>
          {:else}
            <p class="hint">Tentative de <strong>{app.activePlayer.name}</strong> (cote de grimpe {Math.round(app.activePlayer.ratings.grimpe.rating)})</p>
            {#if !app.activePlayer.placedAt}
              <p class="hint">Pas encore de placement : la cote bougera beaucoup sur les premiers blocs. Le placement se lance depuis l'onglet Joueurs.</p>
            {/if}
            <div class="row two">
              <button class="success" onclick={() => record(true)}>Réussi</button>
              <button class="fall" onclick={() => record(false)}>Chute</button>
            </div>
          {/if}
        {:else}
          <p class="hint">Crée un joueur (onglet Joueurs) pour enregistrer tes tentatives et faire évoluer ta cote.</p>
        {/if}
      </div>
    {/if}
    {#if currentBlock && mode !== "bibliotheque"}
      <IntervalTimer
        block={currentBlock}
        bind:preset={timer.preset}
        bind:config={timer.config}
        bind:chained={timer.chained}
        bind:pauseS={timer.pauseS}
        onNext={mode === "classique" && run && run.selected < run.blocks.length - 1
          ? () => pickBlock(run!.selected + 1)
          : undefined}
      />
    {/if}
  </section>
</div>
{/if}

<style>
  .screen {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(280px, 1fr) minmax(260px, 340px);
    gap: 16px;
    align-items: start;
  }
  /* Tablette : le pan à gauche (il reste à l'écran), le choix du mur et les outils à droite. */
  @media (max-width: 1199px) {
    .screen {
      grid-template-columns: minmax(0, 1.15fr) minmax(300px, 1fr);
    }
    .pan-panel {
      grid-column: 1;
      grid-row: 1 / span 2;
      position: sticky;
      top: 12px;
    }
    .wall-panel,
    .gen-panel {
      grid-column: 2;
    }
  }
  @media (max-width: 699px) {
    .screen {
      grid-template-columns: 1fr;
    }
    .pan-panel {
      grid-column: auto;
      grid-row: auto;
      position: static;
      order: -1;
    }
    .wall-panel,
    .gen-panel {
      grid-column: auto;
    }
  }
  .welcome {
    max-width: 960px;
    margin: 0 auto;
  }
  .welcome-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  .welcome-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .welcome-card small {
    color: var(--muted);
    line-height: 1.35;
  }
  .welcome-card .row {
    flex-wrap: nowrap;
  }
  .welcome-card input[type="number"] {
    width: 80px;
  }
  .welcome-card > button {
    margin-top: auto;
  }
  .card-icon {
    font-size: 1.6rem;
    line-height: 1;
  }
  .tabs {
    display: flex;
    gap: 8px;
  }
  .tabs button {
    flex: 1;
  }
  .pieces {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .pieces button {
    padding: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 0.8rem;
    min-height: 56px;
  }
  .symbol {
    font-size: 1.5rem;
    line-height: 1;
  }
  .result,
  .attempt {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .result p,
  .attempt p {
    margin: 4px 0;
  }
  .sequence {
    font-weight: 600;
    word-break: break-word;
  }
  .blocks {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
  }
  .blocks button {
    width: 100%;
  }
  .carnet,
  .session {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .carnet li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    flex-wrap: wrap;
  }
  .carnet li.selected .carnet-route {
    border-color: var(--accent);
  }
  .carnet-route {
    flex: 1;
    min-width: 180px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 6px 10px;
  }
  .carnet-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .done {
    color: #2e7d32;
    font-weight: 700;
    font-size: 1.2rem;
  }
  .carnet-actions {
    display: flex;
    gap: 6px;
  }
  .mini {
    min-height: 40px;
    padding: 0 12px;
    color: #fff;
    border: none;
    font-weight: 600;
  }
  .mini.ok {
    background: #2e7d32;
  }
  .mini.ko {
    background: #c62828;
  }
  .session button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-start;
  }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex: none;
  }
  .variants summary {
    cursor: pointer;
    font-size: 0.9rem;
  }
  .variants .row {
    margin-top: 6px;
  }
  .mini-chip {
    min-height: 34px;
    padding: 0 10px;
    font-size: 0.8rem;
    border-radius: 999px;
  }
  .variant {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid #6a1b9a;
    background: var(--bg);
    border-radius: 6px;
  }
  .sector-fig {
    margin: 0 0 10px;
  }
  .sector-fig figcaption {
    font-size: 0.85rem;
    color: var(--muted);
    margin-top: 4px;
  }
  .sector {
    display: block;
    width: 100%;
    border-radius: 10px;
  }
  .empty {
    text-align: center;
    color: var(--muted);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .link {
    min-height: 0;
    padding: 0 6px;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
  }
  input[type="range"] {
    width: 100%;
  }
  .tabs {
    flex-wrap: wrap;
  }
  .run {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .run h3 {
    margin: 0;
    font-size: 1rem;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
  }
  .run h3 small {
    font-weight: 400;
    color: var(--muted);
  }
  .run-actions select,
  .run-actions button {
    min-height: 44px;
  }
  .mark {
    color: #c62828;
    font-weight: 700;
  }
  .mark.ok {
    color: #2e7d32;
  }
  .ok-text {
    color: #2e7d32;
  }
  .ko-text {
    color: #c62828;
  }
  .has-comment {
    color: var(--muted);
    margin-left: auto;
  }
  .fav[aria-pressed="true"] {
    color: #b8860b;
    border-color: #b8860b;
  }
  .tags summary {
    cursor: pointer;
    font-size: 0.9rem;
  }
  .tags .row {
    margin-top: 6px;
  }
  .mini-chip.required {
    background: #2e7d32;
    border-color: #2e7d32;
    color: #fff;
  }
  .mini-chip.excluded {
    background: #c62828;
    border-color: #c62828;
    color: #fff;
    text-decoration: line-through;
  }
  .message {
    margin: 0;
    font-size: 0.9rem;
  }
  .editing-hint {
    margin: 0 0 8px;
    padding: 6px 10px;
    border-radius: 8px;
    background: #fff3cd;
    color: #5c4400;
    font-size: 0.9rem;
  }
</style>
