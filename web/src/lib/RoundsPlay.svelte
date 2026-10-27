<script lang="ts">
  import type { PieceSymbol, Square } from "chess.js";
  import { estimateBlockRating } from "../core/blockRating";
  import { engineSettings } from "../core/engine";
  import type { Color } from "../core/game";
  import type { Block } from "../core/generator";
  import { PIECES } from "../core/pieces";
  import { RoundsGame, type MemeResult } from "../core/rounds";
  import { distance, holdAt } from "../core/wall";
  import { app } from "./appState.svelte";
  import Board from "./Board.svelte";
  import PanView from "./PanView.svelte";
  import { Stockfish } from "./stockfish";

  interface Props {
    game: RoundsGame;
    ids: Record<Color, string>;
    onExit: () => void;
  }

  let { game, ids, onExit }: Props = $props();

  const COLOR_LABEL: Record<Color, string> = { w: "Blancs", b: "Noirs" };
  const REASON_LABEL: Record<string, string> = {
    mat: "échec et mat",
    pat: "pat",
    nulle: "nulle",
    temps: "au temps",
    abandon: "abandon",
    ko: "abandon au mur (3 duels perdus de suite)",
    points: "aux points (duels au mur)",
  };
  const DUEL_LABEL = { ajoute: "Ajoute une prise", meme: "Même bloc", impose: "Bloc imposé" } as const;

  let version = $state(0);
  let now = $state(Date.now());
  let selected = $state<Square | null>(null);
  let promotionChoice = $state<{ from: Square; to: Square } | null>(null);
  let flipped = $state(false);
  let message = $state("");
  let hint = $state<{ from: Square; to: Square; text: string } | null>(null);
  let recorded = $state(false);

  // Duels : saisie en cours
  let candidate = $state<string | null>(null);
  let memeAttempts = $state(0);
  let memeStopping = $state(false);
  let composing = $state<string[]>([]);

  const name = (c: Color) => game.config.players[c].name;
  const refresh = () => version++;

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
      const before = `${game.stage}/${game.round}`;
      game.tick(now);
      if (`${game.stage}/${game.round}` !== before) {
        resetDuelInput();
        refresh();
      }
    }, 200);
    return () => clearInterval(id);
  });

  // Écran allumé pendant la partie.
  $effect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  });

  // Sauvegarde après chaque action ; cotes à la fin (une seule fois).
  $effect(() => {
    void version;
    if (game.result) {
      if (!recorded) {
        recorded = true;
        const score = game.result.winner === "w" ? 1 : game.result.winner === "b" ? 0 : 0.5;
        app.recordGame(ids.w, ids.b, score, REASON_LABEL[game.result.reason] ?? game.result.reason);
      }
      app.saveGame(null);
      return;
    }
    app.saveGame({ kind: "rounds", rounds: game.save(Date.now()), ids: { ...ids }, humanColor: "w" });
  });

  const view = $derived.by(() => {
    void version;
    const history = game.chess.history({ verbose: true });
    const last = history.at(-1);
    return {
      board: game.chess.board(),
      stage: game.stage,
      turn: game.turn,
      round: game.round,
      duel: game.duel ? JSON.parse(JSON.stringify(game.duel)) as NonNullable<typeof game.duel> : null,
      wins: game.duelWins(),
      streak: { ...game.lossStreak },
      bonusFor: game.bonusFor,
      joker: { ...game.jokerAvailable },
      result: game.result,
      running: game.clock.running,
      lastMove: last ? ([last.from, last.to] as [Square, Square]) : null,
      legal: game.stage === "echecs" ? game.chess.moves({ verbose: true }) : [],
      log: [...game.log].reverse().slice(0, 8),
    };
  });

  const targets = $derived.by(() => {
    if (hint) return new Set<Square>([hint.from, hint.to]);
    if (view.stage !== "echecs" || !selected) return new Set<Square>();
    return new Set(view.legal.filter((m) => m.from === selected).map((m) => m.to));
  });

  function clockText(ms: number): string {
    const s = Math.ceil(Math.max(0, ms) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function onSquare(square: Square) {
    if (view.stage !== "echecs") return;
    hint = null;
    if (selected && targets.has(square)) {
      if (view.legal.some((m) => m.from === selected && m.to === square && m.promotion)) {
        promotionChoice = { from: selected, to: square };
        return;
      }
      play(selected, square);
      return;
    }
    selected = view.legal.some((m) => m.from === square) ? square : null;
  }

  function play(from: Square, to: Square, promotion?: PieceSymbol) {
    try {
      game.play(from, to, promotion, Date.now());
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    selected = null;
    promotionChoice = null;
    refresh();
  }

  // --- Joker : indice de Stockfish à pleine force ---
  const stockfish = new Stockfish();
  $effect(() => () => stockfish.stop());
  let hintBusy = $state(false);
  async function useJoker() {
    const color = game.turn;
    game.useJoker(color);
    refresh();
    hintBusy = true;
    try {
      const lan = await stockfish.bestMove(game.chess.fen(), { ...engineSettings(2800), movetimeMs: 1000 });
      const move = game.chess.moves({ verbose: true }).find((m) => m.lan === lan);
      hint = { from: lan.slice(0, 2) as Square, to: lan.slice(2, 4) as Square, text: move?.san ?? lan };
    } catch (e) {
      message = `Indice indisponible : ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      hintBusy = false;
    }
  }

  // --- Duels ---
  function resetDuelInput() {
    candidate = null;
    memeAttempts = 0;
    memeStopping = false;
    composing = [];
  }

  function blockOf(holdIds: string[]): Block | null {
    const wall = app.wall;
    if (!wall) return null;
    const holds = holdIds.map((id) => wall.holds.find((h) => h.id === id)).filter((h): h is NonNullable<typeof h> => !!h);
    if (holds.length === 0) return null;
    return { holds, estimatedRating: estimateBlockRating(holds.map((h) => h.level)), relaxations: [] };
  }

  function recordClimb(color: Color, holdIds: string[], success: boolean) {
    const block = blockOf(holdIds);
    if (block && app.ratings.players.some((p) => p.id === ids[color])) app.recordAttempt(ids[color], block, success, "partie");
  }

  function act(fn: () => void) {
    message = "";
    try {
      fn();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    refresh();
  }

  /** Prise ajoutable : à portée de la dernière prise du bloc. */
  function reachable(holdId: string, sequence: string[]): boolean {
    const wall = app.wall;
    const last = sequence.at(-1);
    if (!wall || !last) return true;
    const a = wall.holds.find((h) => h.id === last);
    const b = wall.holds.find((h) => h.id === holdId);
    return !!a && !!b && distance(a.position, b.position) <= wall.reach;
  }

  function ajouteSuccess(climber: Color, sequence: string[]) {
    if (!candidate) return;
    const id = candidate;
    act(() => {
      game.ajouteSuccess(id);
      recordClimb(climber, sequence, true);
      candidate = null;
    });
  }

  function ajouteFall(climber: Color, sequence: string[]) {
    act(() => {
      recordClimb(climber, sequence, false);
      game.ajouteFall(Date.now());
      resetDuelInput();
    });
  }

  function memeFinish(color: Color, block: string[], result: MemeResult) {
    act(() => {
      recordClimb(color, block, result.success);
      game.memeResult(color, result, Date.now());
      memeAttempts = 0;
      memeStopping = false;
    });
  }

  function onMemeHold(color: Color, block: string[], holdId: string) {
    if (!memeStopping) return;
    const index = block.indexOf(holdId);
    if (index < 0) return;
    memeFinish(color, block, { success: false, attempts: Math.max(1, memeAttempts), highest: index + 1 });
  }

  function toggleCompose(holdId: string) {
    composing = composing.includes(holdId) ? composing.filter((id) => id !== holdId) : [...composing, holdId];
  }

  const composingRating = $derived(blockOf(composing)?.estimatedRating ?? 0);

  function submitCompose(color: Color) {
    act(() => {
      game.imposeCompose(color, [...composing], composingRating);
      composing = [];
    });
  }

  function imposeResult(color: Color, holdIds: string[], success: boolean) {
    act(() => {
      recordClimb(color, holdIds, success);
      game.imposeResult(color, success, Date.now());
    });
  }

  const pieceOf = (p: string | undefined) => PIECES.find((x) => x.id === p);
  const top: Color = $derived(flipped ? "w" : "b");
  const bottom: Color = $derived(flipped ? "b" : "w");
</script>

<div class="rounds">
  <section class="panel board-panel">
    <div class="status">
      <span>
        {#if view.stage === "echecs"}Round {view.round + 1}/{game.params.maxRounds} · <strong>Échecs</strong>
        {:else if view.stage === "mur"}Round {view.round + 1}/{game.params.maxRounds} · <strong>Mur</strong> (plateau figé)
        {:else if view.stage === "bonus"}Bonus
        {:else}Partie terminée{/if}
      </span>
      {#if view.stage === "echecs" || view.stage === "mur"}
        <strong class="round-timer">{clockText((void version, game.stageRemaining(now)))}</strong>
      {/if}
    </div>
    <div class="clock" class:running={view.running === top}>
      <span>{name(top)} · {COLOR_LABEL[top]} · duels {view.wins[top]}</span>
      <strong>{clockText(game.clock.remainingAt(top, now))}</strong>
    </div>
    <div class:frozen={view.stage !== "echecs"}>
      <Board board={view.board} {flipped} {selected} {targets} lastMove={view.lastMove} {onSquare} />
    </div>
    <div class="clock" class:running={view.running === bottom}>
      <span>{name(bottom)} · {COLOR_LABEL[bottom]} · duels {view.wins[bottom]}</span>
      <strong>{clockText(game.clock.remainingAt(bottom, now))}</strong>
    </div>
    {#if promotionChoice}
      <div class="row">
        Promotion :
        {#each [["q", "Dame"], ["r", "Tour"], ["b", "Fou"], ["n", "Cavalier"]] as [p, label] (p)}
          <button onclick={() => play(promotionChoice!.from, promotionChoice!.to, p as PieceSymbol)}>{label}</button>
        {/each}
      </div>
    {/if}
    <div class="row">
      <button onclick={() => (flipped = !flipped)}>Retourner</button>
    </div>
  </section>

  <section class="panel side">
    {#if view.stage === "over" && view.result}
      <h2>Partie terminée</h2>
      <p class="big">{view.result.winner ? `${name(view.result.winner)} gagne` : "Nulle"} — {REASON_LABEL[view.result.reason] ?? view.result.reason}</p>
      <p class="hint">Duels au mur : {name("w")} {view.wins.w} – {view.wins.b} {name("b")}. Cote Chesscalade mise à jour.</p>
      <button class="primary" onclick={onExit}>Nouvelle partie</button>
    {:else if view.stage === "echecs"}
      <h2>Au tour de {name(view.turn)} ({COLOR_LABEL[view.turn]})</h2>
      <p class="hint">Le round de mur commence à la fin du chrono du round. Pendant le mur, le plateau est figé : profitez-en pour réfléchir.</p>
      {#if game.config.family === "B"}
        <div class="row">
          <button disabled={!view.joker[view.turn] || hintBusy} onclick={useJoker}>
            {hintBusy ? "Indice en cours…" : view.joker[view.turn] ? "Joker : un indice" : "Joker utilisé"}
          </button>
        </div>
      {/if}
      {#if hint}<p class="hint-move">Indice : <strong>{hint.text}</strong> ({hint.from} → {hint.to})</p>{/if}
      <div class="row">
        <button onclick={() => act(() => game.resign(view.turn, Date.now()))}>Abandon ({COLOR_LABEL[view.turn]})</button>
      </div>
    {:else if view.stage === "bonus" && view.bonusFor}
      <h2>{name(view.bonusFor)} gagne le duel : bonus</h2>
      <div class="row">
        <button class="primary" onclick={() => act(() => game.chooseBonus("temps", Date.now()))}>+30 s de pendule</button>
        <button onclick={() => act(() => game.chooseBonus("joker", Date.now()))} disabled={view.joker[view.bonusFor]}>
          Un joker (indice du moteur)
        </button>
      </div>
      {#if view.joker[view.bonusFor]}<p class="hint">Joker déjà en main : prends le temps.</p>{/if}
    {:else if view.stage === "mur" && view.duel}
      {@const duel = view.duel}
      <h2>Duel au mur : {DUEL_LABEL[duel.format]}</h2>
      {#if game.stageRemaining(now) === 0}
        <div class="timeout">
          <p><strong>Temps du round écoulé.</strong> Qui est allé le plus haut ?</p>
          <div class="row">
            <button onclick={() => act(() => game.decideDuel("w", Date.now()))}>{name("w")}</button>
            <button onclick={() => act(() => game.decideDuel("b", Date.now()))}>{name("b")}</button>
            <button onclick={() => act(() => game.decideDuel(null, Date.now()))}>Égalité</button>
          </div>
        </div>
      {/if}

      {#if duel.format === "ajoute"}
        {@const piece = pieceOf(duel.piece)}
        <p>
          <strong>{name(duel.climber)}</strong> : répète les {duel.sequence.length} prises, puis touche sur le pan la prise que tu ajoutes.
          {#if piece}<span class="hint">Pièce du round : {piece.symbol} {piece.label} ({piece.character.toLowerCase()}).</span>{/if}
        </p>
        {#if app.wall}
          <PanView wall={app.wall} sequence={duel.sequence} {candidate} onHold={(id) => (candidate = duel.sequence.includes(id) ? null : id)} />
        {/if}
        {#if candidate && !reachable(candidate, duel.sequence)}
          <p class="warn">{candidate} est hors de portée de {duel.sequence.at(-1)} : à vous de juger si c'est grimpable.</p>
        {/if}
        <div class="actions">
          <button class="success" disabled={!candidate} onclick={() => ajouteSuccess(duel.climber, duel.sequence)}>
            Réussi{candidate ? ` + ${candidate}` : ""}
          </button>
          <button class="fall" onclick={() => ajouteFall(duel.climber, duel.sequence)}>Chute / erreur</button>
        </div>
      {:else if duel.format === "meme"}
        {@const climber = duel.order.find((c) => !duel.results[c])}
        {@const piece = pieceOf(duel.piece)}
        <p class="hint">
          {#if piece}{piece.symbol} {piece.label} · {/if}cote {duel.estimatedRating}
          {#each duel.order as c (c)}
            {#if duel.results[c]}
              · {name(c)} : {duel.results[c]!.success ? `réussi en ${duel.results[c]!.attempts} essai(s)` : `prise ${duel.results[c]!.highest} en ${duel.results[c]!.attempts} essai(s)`}
            {/if}
          {/each}
        </p>
        {#if app.wall}
          <PanView wall={app.wall} sequence={duel.block} onHold={climber && memeStopping ? (id) => onMemeHold(climber, duel.block, id) : undefined} />
        {/if}
        {#if climber}
          <p><strong>{name(climber)}</strong> grimpe · essais : {memeAttempts}</p>
          {#if memeStopping}
            <p class="warn">Touche sur le pan la prise la plus haute atteinte.</p>
            <button onclick={() => (memeStopping = false)}>Annuler</button>
          {:else}
            <div class="actions three">
              <button class="success" onclick={() => memeFinish(climber, duel.block, { success: true, attempts: memeAttempts + 1, highest: duel.block.length })}>Réussi</button>
              <button onclick={() => memeAttempts++}>Essai raté</button>
              <button class="fall" onclick={() => (memeStopping = true)}>J'arrête</button>
            </div>
          {/if}
        {/if}
      {:else if duel.format === "impose"}
        {#if duel.step === "compose"}
          <p>
            <strong>{name(duel.actor)}</strong> compose le bloc de {name(duel.actor === "w" ? "b" : "w")} : touche les prises dans l'ordre.
            Budget : <strong>{duel.budget}</strong>{duel.restarts > 0 ? ` (relance ${duel.restarts})` : ""}.
          </p>
          {#if app.wall}
            <PanView wall={app.wall} sequence={composing} onHold={toggleCompose} />
          {/if}
          <p class:warn={composingRating > duel.budget}>
            {composing.length} prise(s) · cote estimée {composing.length ? composingRating : "—"}
            {composingRating > duel.budget ? " : au-dessus du budget" : ""}
          </p>
          <div class="row">
            <button class="primary" disabled={composing.length < 3 || composingRating > duel.budget} onclick={() => submitCompose(duel.actor)}>Valider le bloc</button>
            <button disabled={!composing.length} onclick={() => (composing = composing.slice(0, -1))}>Retirer la dernière</button>
          </div>
        {:else}
          {@const holdsToClimb = duel.composed[duel.actor === "w" ? "b" : "w"] ?? []}
          <p><strong>{name(duel.actor)}</strong> grimpe le bloc composé par {name(duel.actor === "w" ? "b" : "w")}.</p>
          {#if app.wall}<PanView wall={app.wall} sequence={holdsToClimb} />{/if}
          <div class="actions">
            <button class="success" onclick={() => imposeResult(duel.actor, holdsToClimb, true)}>Réussi</button>
            <button class="fall" onclick={() => imposeResult(duel.actor, holdsToClimb, false)}>Chute</button>
          </div>
        {/if}
      {/if}
      {#if !app.wall}<p class="warn">Aucun pan chargé : charge ton pan dans l'onglet Pan.</p>{/if}
    {/if}

    {#if message}<p class="warn">{message}</p>{/if}
    <p class="hint">
      Défaites au mur d'affilée : {name("w")} {view.streak.w}/3 · {name("b")} {view.streak.b}/3
    </p>
    <details>
      <summary>Journal</summary>
      <ul class="log">
        {#each view.log as entry, i (i)}<li>{entry}</li>{/each}
      </ul>
    </details>
  </section>
</div>

<style>
  .rounds {
    display: grid;
    grid-template-columns: minmax(300px, 600px) minmax(280px, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .rounds {
      grid-template-columns: 1fr;
    }
  }
  .status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .round-timer {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
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
    font-size: 1.4rem;
    font-variant-numeric: tabular-nums;
  }
  .clock.running {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .frozen {
    opacity: 0.6;
    pointer-events: none;
  }
  .big {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .actions.three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .actions button {
    min-height: 56px;
  }
  .timeout {
    padding: 10px;
    border-radius: 10px;
    border: 2px solid var(--warn);
  }
  .timeout p {
    margin: 0 0 8px;
  }
  .hint-move {
    margin: 0;
    padding: 8px 10px;
    border-left: 4px solid #6a1b9a;
    background: var(--bg);
    border-radius: 6px;
  }
  .side p {
    margin: 0;
  }
  .log {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 0.9rem;
  }
</style>
