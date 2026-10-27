<script lang="ts">
  import type { PieceSymbol, Square } from "chess.js";
  import {
    ChesscaladeGame,
    VERDICT_LABELS,
    type BlockRequest,
    type Color,
    type Deviation,
    type Difficulty,
    type Format,
  } from "../core/game";
  import { engineSettings, pickEngineMove } from "../core/engine";
  import { generateChessBlock } from "../core/generator";
  import { PIECES } from "../core/pieces";
  import { seededRng } from "../core/random";
  import { app } from "./appState.svelte";
  import BlockChallenge from "./BlockChallenge.svelte";
  import Board from "./Board.svelte";
  import { Stockfish } from "./stockfish";

  const DIFFICULTIES: { id: Difficulty; label: string }[] = [
    { id: "facile", label: "Facile" },
    { id: "modere", label: "Modéré" },
    { id: "difficile", label: "Difficile" },
    { id: "diabolique", label: "Diabolique" },
  ];
  const KIND_LABEL = {
    defi: "Bloc-défi",
    parade: "Bloc de parade",
    recharge: "Recharge",
    defense: "Bloc de défense",
    "contre-attaque": "Contre-attaque",
  } as const;
  const TRIGGER_LABEL = { capture: "prise", echec: "échec", promotion: "promotion", roque: "roque", mat: "mat" } as const;
  const REASON_LABEL = { mat: "échec et mat", pat: "pat", nulle: "nulle", temps: "au temps", abandon: "abandon" } as const;
  const COLOR_LABEL: Record<Color, string> = { w: "Blancs", b: "Noirs" };

  // --- Réglages ---
  let format = $state<Format>("classique");
  let difficulty = $state<Difficulty>("modere");
  let deviation = $state<Deviation>("courte");
  let whiteId = $state(app.ratings.players[0]?.id ?? "");
  let blackId = $state(app.ratings.players[1]?.id ?? app.ratings.players[0]?.id ?? "");
  let fatigue = $state<Record<Color, boolean>>({ w: false, b: false });
  let mode = $state<"duo" | "solo">("solo");
  let soloId = $state(app.activePlayer?.id ?? "");
  let soloColor = $state<Color | "hasard">("w");
  /** Force du moteur : par défaut la cote Chesscalade du joueur (elle monte quand il gagne, §9.1). */
  let engineElo = $state(Math.round(app.activePlayer?.ratings.chesscalade.rating ?? 1500));
  let humanColor = $state<Color>("w");

  // --- Partie ---
  let game = $state.raw<ChesscaladeGame | null>(null);
  let ids = $state<Record<Color, string>>({ w: "", b: "" });
  /** Incrémenté après chaque action : la partie n'est pas un objet réactif. */
  let version = $state(0);
  let now = $state(Date.now());
  let selected = $state<Square | null>(null);
  let promotionChoice = $state<{ from: Square; to: Square } | null>(null);
  let flipped = $state(false);
  let gameRecorded = $state(false);
  let lastDelta = $state<{ name: string; delta: number } | null>(null);
  const usage = new Map<string, number>();

  const nameOf = (id: string) => app.ratings.players.find((p) => p.id === id)?.name ?? "Invité";

  function start() {
    if (mode === "solo") {
      humanColor = soloColor === "hasard" ? (Math.random() < 0.5 ? "w" : "b") : soloColor;
      const engineColor: Color = humanColor === "w" ? "b" : "w";
      const human = { name: nameOf(soloId), climbRating: climbRating(soloId), fatigue: fatigue.w };
      const engine = { name: `Stockfish ${engineElo}`, climbRating: 0, fatigue: false };
      const players = humanColor === "w" ? { w: human, b: engine } : { w: engine, b: human };
      ids = humanColor === "w" ? { w: soloId, b: "" } : { w: "", b: soloId };
      game = new ChesscaladeGame(
        { format, difficulty, deviation, players, engine: { color: engineColor, elo: engineElo } },
        makeBlock,
        Date.now(),
      );
      flipped = humanColor === "b";
    } else {
      const players = {
        w: { name: nameOf(whiteId), climbRating: climbRating(whiteId), fatigue: fatigue.w },
        b: { name: nameOf(blackId), climbRating: climbRating(blackId), fatigue: fatigue.b },
      };
      ids = { w: whiteId, b: blackId };
      game = new ChesscaladeGame({ format, difficulty, deviation, players }, makeBlock, Date.now());
    }
    engineError = "";
    selected = null;
    gameRecorded = false;
    lastDelta = null;
    refresh();
  }

  /** Reprend la partie sauvegardée (après un rechargement, ou depuis un autre appareil). */
  function resume() {
    const live = app.liveGame;
    if (!live) return;
    game = ChesscaladeGame.restore(live.game, makeBlock, Date.now());
    ids = { ...live.ids };
    humanColor = live.humanColor;
    flipped = !!game.config.engine && humanColor === "b";
    engineError = "";
    selected = null;
    gameRecorded = false;
    lastDelta = null;
    refresh();
  }

  function discardSaved() {
    app.saveGame(null);
  }

  function climbRating(id: string): number {
    return Math.round(app.ratings.players.find((p) => p.id === id)?.ratings.grimpe.rating ?? 1500);
  }

  function makeBlock(request: BlockRequest) {
    if (!app.wall) return null;
    return generateChessBlock(app.wall, { ...request, usage, rng: seededRng(Date.now()) });
  }

  function refresh() {
    version++;
  }

  $effect(() => {
    if (!game) return;
    const id = setInterval(() => {
      now = Date.now();
      if (game && game.phase !== "over") {
        const before = game.phase;
        game.checkFlag(now);
        if (game.phase !== before) refresh();
      }
    }, 200);
    return () => clearInterval(id);
  });

  // Écran allumé pendant la partie (la tablette reste au pied du mur). Refus toléré.
  $effect(() => {
    if (!game) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  });

  // Fin de partie : cote Chesscalade (une seule fois).
  $effect(() => {
    void version;
    if (game?.result && !gameRecorded) {
      gameRecorded = true;
      const score = game.result.winner === "w" ? 1 : game.result.winner === "b" ? 0 : 0.5;
      const engine = game.config.engine;
      if (engine) {
        const humanId = ids[humanColor];
        const humanScore = humanColor === "w" ? score : 1 - score;
        app.recordGameVsEngine(humanId, humanColor, engine.elo, humanScore, REASON_LABEL[game.result.reason]);
        // La partie suivante se joue contre un moteur à la nouvelle cote du joueur.
        const updated = app.ratings.players.find((p) => p.id === humanId);
        if (updated) engineElo = Math.round(updated.ratings.chesscalade.rating);
      } else {
        app.recordGame(ids.w, ids.b, score, REASON_LABEL[game.result.reason]);
      }
    }
  });

  // Sauvegarde après chaque action ; effacée quand la partie est terminée.
  $effect(() => {
    void version;
    const g = game;
    if (!g) return;
    if (g.result) {
      if (app.liveGame) app.saveGame(null);
      return;
    }
    app.saveGame({ game: g.save(Date.now()), ids: { ...ids }, humanColor });
  });

  // --- Moteur (solo) ---
  const stockfish = new Stockfish();
  let engineThinking = $state(false);
  let engineError = $state("");
  let engineBusy = false;
  $effect(() => () => stockfish.stop());
  $effect(() => {
    void version;
    const g = game;
    const engine = g?.config.engine;
    if (!g || !engine || engineBusy || !g.isEngineTurn()) return;
    engineBusy = true;
    engineThinking = true;
    const fen = g.chess.fen();
    const candidates = g.engineCandidates();
    const settings = engineSettings(engine.elo);
    const playMove = (lan: string) => {
      if (game !== g || g.chess.fen() !== fen || !g.isEngineTurn()) return;
      g.play(lan.slice(0, 2) as Square, lan.slice(2, 4) as Square, (lan[4] as PieceSymbol | undefined) || undefined, Date.now());
      refresh();
    };
    stockfish
      .bestMove(fen, settings, g.engineExcluded.length > 0 ? candidates : undefined)
      .then((best) => playMove(pickEngineMove(best, candidates, settings, Math.random)))
      .catch((e: unknown) => {
        // Moteur indisponible : un coup au hasard, pour ne pas bloquer la partie.
        engineError = `${e instanceof Error ? e.message : String(e)} Coup joué au hasard.`;
        playMove(candidates[Math.floor(Math.random() * candidates.length)]);
      })
      .finally(() => {
        engineBusy = false;
        engineThinking = false;
        refresh();
      });
  });

  // Sur téléphone, le bloc s'affiche sous l'échiquier : on l'amène à l'écran quand il apparaît.
  let sidePanel = $state<HTMLElement | null>(null);
  let lastPhase: string | null = null;
  $effect(() => {
    const phase = view?.phase ?? null;
    if (phase !== lastPhase && (phase === "block" || phase === "deviation") && sidePanel && window.innerWidth <= 900) {
      sidePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastPhase = phase;
  });

  // --- Vue dérivée de la partie ---
  const view = $derived.by(() => {
    void version;
    if (!game) return null;
    const allowed = game.phase === "move" ? game.allowedMoves() : [];
    const history = game.chess.history({ verbose: true });
    const last = history.at(-1);
    const turn = game.turn;
    let checkSquare: Square | null = null;
    if (game.chess.inCheck()) {
      for (const row of game.chess.board()) for (const p of row) if (p && p.type === "k" && p.color === turn) checkSquare = p.square;
    }
    return {
      board: game.chess.board(),
      phase: game.phase,
      turn,
      allowed,
      pending: game.pending,
      deviation: game.deviation,
      result: game.result,
      lastMove: last ? ([last.from, last.to] as [Square, Square]) : null,
      checkSquare,
      exhausted: new Set(game.exhausted.map((e) => e.square)),
      log: [...game.log].reverse().slice(0, 12),
      sans: history.map((m) => m.san),
      canRecharge: game.canRecharge(),
      canCounter: game.canCounterAttack(),
      engineTurn: game.isEngineTurn(),
      falls: { ...game.consecutiveFalls },
      kingOnly: game.kingOnly,
      running: game.clock.running,
      lastVerdict: game.lastVerdict,
      fatigue: { w: game.config.players.w.fatigue, b: game.config.players.b.fatigue },
    };
  });

  const targets = $derived.by(() => {
    if (!view) return new Set<Square>();
    if (view.phase === "deviation" && view.deviation) return new Set(view.deviation.options.map((m) => m.to));
    if (view.phase === "move" && selected) return new Set(view.allowed.filter((m) => m.from === selected).map((m) => m.to));
    return new Set<Square>();
  });

  function onSquare(square: Square) {
    if (!game || !view || view.engineTurn) return;
    if (view.phase === "deviation") {
      if (targets.has(square)) {
        game.chooseDeviation(square, Date.now());
        refresh();
      }
      return;
    }
    if (view.phase !== "move") return;
    if (selected && targets.has(square)) {
      const promo = view.allowed.some((m) => m.from === selected && m.to === square && m.promotion);
      if (promo) {
        promotionChoice = { from: selected, to: square };
        return;
      }
      play(selected, square);
      return;
    }
    selected = view.allowed.some((m) => m.from === square) ? square : null;
  }

  function play(from: Square, to: Square, promotion?: PieceSymbol) {
    if (!game) return;
    game.play(from, to, promotion, Date.now());
    selected = null;
    promotionChoice = null;
    lastDelta = null;
    refresh();
  }

  function blockResult(success: boolean) {
    if (!game?.pending) return;
    const pending = game.pending;
    const climberId = ids[pending.request.climber];
    const outcome = game.blockResult(success, Date.now());
    // Un essai raté qui laisse un second essai (Facile) n'est pas encore une tentative terminée.
    const finished = game.pending !== pending;
    if (finished && outcome.block && app.ratings.players.some((p) => p.id === climberId)) {
      const delta = app.recordAttempt(climberId, outcome.block, success, "partie");
      lastDelta = { name: nameOf(climberId), delta };
    }
    refresh();
  }

  function counterAttack() {
    game?.requestCounterAttack(Date.now());
    selected = null;
    refresh();
  }

  function recharge(hard: boolean) {
    game?.requestRecharge(hard, Date.now());
    selected = null;
    refresh();
  }

  function toggleFatigue(color: Color) {
    if (!game) return;
    game.setFatigue(color, !game.config.players[color].fatigue);
    refresh();
  }

  function clockText(color: Color): string {
    if (!game) return "";
    void version;
    const ms = Math.max(0, game.clock.remainingAt(color, now));
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const pieceLabel = (p: string | null) => PIECES.find((x) => x.id === p)?.label ?? "libre";
</script>

{#if !game || !view}
  <section class="panel setup">
    {#if app.liveGame}
      {@const lg = app.liveGame}
      <div class="resume">
        <div>
          <strong>Partie en cours</strong> : {lg.game.config.players.w.name} – {lg.game.config.players.b.name},
          {lg.game.moves.length} demi-coup(s), {lg.game.config.format === "blitz" ? "Blitz" : "Classique"}
          · sauvegardée le {new Date(lg.game.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </div>
        <div class="row">
          <button class="primary" onclick={resume}>Reprendre la partie</button>
          <button onclick={discardSaved}>Supprimer</button>
        </div>
        <p class="hint">Les pendules repartent de leur temps sauvegardé. Commencer une nouvelle partie remplace celle-ci.</p>
      </div>
    {/if}
    <h2>Nouvelle partie Chesscalade</h2>
    <p class="hint">Famille D « intrication » (REGLES.md §4 à §6). Les blocs sont générés sur le pan actif{app.wall ? ` (${app.wall.name})` : " — aucun pan chargé"}.</p>
    {#if app.ratings.players.length === 0}
      <p class="warn">Crée au moins un joueur (onglet Joueurs) pour que les cotes évoluent. Sinon, la partie se joue en invité.</p>
    {/if}
    <div class="row">
      <button aria-pressed={mode === "solo"} onclick={() => (mode = "solo")}>Solo contre Stockfish</button>
      <button aria-pressed={mode === "duo"} onclick={() => (mode = "duo")}>À deux</button>
    </div>
    {#if mode === "solo"}
      <div class="grid">
        <div class="player">
          <label class="field">
            Joueur
            <select
              bind:value={soloId}
              onchange={() => {
                const p = app.ratings.players.find((x) => x.id === soloId);
                if (p) engineElo = Math.round(p.ratings.chesscalade.rating);
              }}
            >
              <option value="">Invité</option>
              {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (Chesscalade {Math.round(p.ratings.chesscalade.rating)})</option>{/each}
            </select>
          </label>
          <label class="check"><input type="checkbox" bind:checked={fatigue.w} /> Option fatigue</label>
        </div>
        <div class="field">
          Couleur
          <div class="row">
            <button aria-pressed={soloColor === "w"} onclick={() => (soloColor = "w")}>Blancs</button>
            <button aria-pressed={soloColor === "b"} onclick={() => (soloColor = "b")}>Noirs</button>
            <button aria-pressed={soloColor === "hasard"} onclick={() => (soloColor = "hasard")}>Au hasard</button>
          </div>
        </div>
      </div>
      <label class="field">
        Force du moteur : <strong>{engineElo}</strong>
        <input type="range" min="400" max="2800" step="50" bind:value={engineElo} />
      </label>
      <p class="hint">
        Le moteur ne grimpe pas : quand il prend une pièce ou donne échec, c'est toi qui grimpes un bloc de défense (une chute coûte du temps).
        En Difficile et Diabolique, une contre-attaque par partie peut annuler son dernier coup. Sous 1320, la force est approximative (coups au hasard).
      </p>
    {:else}
    <div class="grid">
      {#each [["w", "Blancs"], ["b", "Noirs"]] as [color, label] (color)}
        <div class="player">
          <label class="field">
            {label}
            {#if color === "w"}
              <select bind:value={whiteId}>
                <option value="">Invité</option>
                {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (grimpe {Math.round(p.ratings.grimpe.rating)})</option>{/each}
              </select>
            {:else}
              <select bind:value={blackId}>
                <option value="">Invité</option>
                {#each app.ratings.players as p (p.id)}<option value={p.id}>{p.name} (grimpe {Math.round(p.ratings.grimpe.rating)})</option>{/each}
              </select>
            {/if}
          </label>
          <label class="check"><input type="checkbox" bind:checked={fatigue[color as Color]} /> Option fatigue</label>
        </div>
      {/each}
    </div>
    {/if}
    <div class="field">
      Rythme
      <div class="row">
        <button aria-pressed={format === "blitz"} onclick={() => (format = "blitz")}>Blitz · 3 min</button>
        <button aria-pressed={format === "classique"} onclick={() => (format = "classique")}>Classique · 10 min</button>
      </div>
    </div>
    <div class="field">
      Difficulté
      <div class="row">
        {#each DIFFICULTIES as d (d.id)}
          <button aria-pressed={difficulty === d.id} onclick={() => (difficulty = d.id)}>{d.label}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      Déviation
      <div class="row">
        <button aria-pressed={deviation === "courte"} onclick={() => (deviation = "courte")}>Courte</button>
        <button aria-pressed={deviation === "libre"} onclick={() => (deviation = "libre")}>Libre</button>
      </div>
    </div>
    <button class="primary" onclick={start}>Commencer la partie</button>
  </section>
{:else}
  <div class="game">
    <section class="panel board-panel">
      <div class="clock" class:running={view.running === (flipped ? "w" : "b")}>
        <span>{flipped ? game.config.players.w.name : game.config.players.b.name} · {COLOR_LABEL[flipped ? "w" : "b"]}</span>
        <strong>{clockText(flipped ? "w" : "b")}</strong>
      </div>
      <Board
        board={view.board}
        {flipped}
        {selected}
        {targets}
        exhausted={view.exhausted}
        lastMove={view.lastMove}
        checkSquare={view.checkSquare}
        intended={view.deviation?.intended ?? null}
        {onSquare}
      />
      <div class="clock" class:running={view.running === (flipped ? "b" : "w")}>
        <span>{flipped ? game.config.players.b.name : game.config.players.w.name} · {COLOR_LABEL[flipped ? "b" : "w"]}</span>
        <strong>{clockText(flipped ? "b" : "w")}</strong>
      </div>
      {#if promotionChoice}
        <div class="row promo">
          Promotion :
          {#each [["q", "Dame"], ["r", "Tour"], ["b", "Fou"], ["n", "Cavalier"]] as [p, label] (p)}
            <button onclick={() => play(promotionChoice!.from, promotionChoice!.to, p as PieceSymbol)}>{label}</button>
          {/each}
        </div>
      {/if}
      <div class="row">
        <button onclick={() => (flipped = !flipped)}>Retourner</button>
        {#if view.phase !== "over"}
          {@const resigner = game.config.engine ? humanColor : view.turn}
          <button onclick={() => { game!.resign(resigner, Date.now()); refresh(); }}>Abandon ({COLOR_LABEL[resigner]})</button>
        {/if}
      </div>
    </section>

    <section class="panel side" bind:this={sidePanel}>
      {#if view.phase === "over" && view.result}
        <h2>Partie terminée</h2>
        <p class="big">
          {view.result.winner ? `${game.config.players[view.result.winner].name} gagne` : "Nulle"} — {REASON_LABEL[view.result.reason]}
        </p>
        <p class="hint">Cote Chesscalade mise à jour (si deux joueurs différents sont enregistrés).</p>
        <button class="primary" onclick={() => (game = null)}>Nouvelle partie</button>
      {:else if view.phase === "block" && view.pending}
        {@const p = view.pending}
        <BlockChallenge
          wall={app.wall}
          block={p.block}
          title={`${KIND_LABEL[p.request.kind]} — ${game.config.players[p.request.climber].name}`}
          subtitle={[
            p.move ? `Coup en suspens : ${p.move.san}` : "",
            p.triggers.length ? `déclencheur : ${p.triggers.map((t) => TRIGGER_LABEL[t]).join(" + ")}` : "",
            `caractère : ${pieceLabel(p.request.piece)}`,
            `cote visée ${p.request.targetRating}`,
            p.attemptsLeft > 1 ? `${p.attemptsLeft} essais` : "",
            p.request.kind === "recharge" || game.config.difficulty === "diabolique" ? "pendule en marche !" : "pendule en pause",
          ]
            .filter(Boolean)
            .join(" · ")}
          timeLimitMs={p.timeLimitMs}
          startedAt={p.startedAt}
          onResult={blockResult}
        />
      {:else if view.phase === "deviation" && view.deviation}
        <h2>Coup dévié</h2>
        <p>
          <strong>{game.config.players[view.deviation.chooser].name}</strong> choisit la case de la pièce en {view.deviation.from}
          {view.deviation.chooser !== view.deviation.player ? `de ${game.config.players[view.deviation.player].name}` : ""}
          (case visée : {view.deviation.intended}). Touche une case en surbrillance.
        </p>
      {:else if view.engineTurn}
        <h2>{game.config.players[view.turn].name} réfléchit…</h2>
      {:else}
        <h2>Au tour de {game.config.players[view.turn].name} ({COLOR_LABEL[view.turn]})</h2>
        {#if view.kingOnly === view.turn}<p class="warn">Parade ratée : il faut parer avec le roi si c'est possible.</p>{/if}
        {#if view.falls[view.turn] > 0}<p class="hint">Chutes consécutives : {view.falls[view.turn]}</p>{/if}
        <div class="row">
          <button disabled={!view.canRecharge} onclick={() => recharge(false)}>Recharge</button>
          {#if game.config.format === "classique"}
            <button disabled={!view.canRecharge} onclick={() => recharge(true)}>Recharge (bloc dur)</button>
          {/if}
          {#if view.canCounter}
            <button class="counter" onclick={counterAttack}>Contre-attaque</button>
          {/if}
        </div>
        <p class="hint">
          Recharge : la pendule tourne pendant le bloc. Disponible tous les 5 coups.
          {#if view.canCounter}Contre-attaque (une fois par partie) : un bloc très dur pour annuler le dernier coup du moteur.{/if}
        </p>
      {/if}
      {#if engineError}<p class="warn">{engineError}</p>{/if}

      {#if lastDelta}
        <p class="hint">Cote de grimpe de {lastDelta.name} : {lastDelta.delta >= 0 ? "+" : ""}{Math.round(lastDelta.delta)}</p>
      {/if}

      {#if view.lastVerdict}
        <p class="verdict">
          Dernier verdict ({game.config.players[view.lastVerdict.color].name}, {view.lastVerdict.move}) :
          <strong>V{view.lastVerdict.verdict} {VERDICT_LABELS[view.lastVerdict.verdict]}</strong>
        </p>
      {/if}

      <details open>
        <summary>Journal</summary>
        <ul class="log">
          {#each view.log as entry, i (view.log.length - i)}
            <li><span class="dot" class:black={entry.color === "b"}></span>{entry.text}</li>
          {/each}
        </ul>
      </details>
      <details>
        <summary>Coups ({view.sans.length})</summary>
        <p class="moves">
          {view.sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ")}
        </p>
      </details>
      <div class="row">
        {#each (["w", "b"] as Color[]).filter((c) => c !== game!.config.engine?.color) as c (c)}
          <label class="check">
            <input type="checkbox" checked={view.fatigue[c as Color]} onchange={() => toggleFatigue(c as Color)} />
            Fatigue {game.config.players[c as Color].name}
          </label>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .setup {
    max-width: 720px;
    margin: 0 auto;
  }
  .resume {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    border: 2px solid var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  .player {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .game {
    display: grid;
    grid-template-columns: minmax(300px, 600px) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .game {
      grid-template-columns: 1fr;
    }
  }
  .clock {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .clock strong {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .clock.running {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .promo {
    align-items: center;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
  }
  .counter {
    border-color: #6a1b9a;
    color: #6a1b9a;
    font-weight: 700;
  }
  .verdict {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid var(--accent);
    background: var(--bg);
    border-radius: 6px;
  }
  .log {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #000;
    background: #fff;
    margin-right: 6px;
  }
  .dot.black {
    background: #000;
  }
  .moves {
    font-size: 0.9rem;
    line-height: 1.6;
  }
</style>
