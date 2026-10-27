<script lang="ts">
  import type { Color, PieceSymbol, Square } from "chess.js";

  interface Props {
    /** Plateau au format chess.js `board()` : rangée 8 en premier. */
    board: ({ type: PieceSymbol; color: Color } | null)[][];
    flipped?: boolean;
    selected?: Square | null;
    targets?: Set<Square>;
    exhausted?: Set<Square>;
    lastMove?: [Square, Square] | null;
    checkSquare?: Square | null;
    /** Case visée d'un coup dévié, à rappeler pendant le choix. */
    intended?: Square | null;
    onSquare?: (square: Square) => void;
  }

  let { board, flipped = false, selected = null, targets = new Set(), exhausted = new Set(), lastMove = null, checkSquare = null, intended = null, onSquare }: Props = $props();

  // Variante texte (FE0E) : évite le rendu emoji du pion sur certains systèmes.
  const GLYPH: Record<PieceSymbol, string> = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  const cells = $derived.by(() => {
    const out: { square: Square; piece: (typeof board)[number][number]; dark: boolean }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rank = flipped ? r : 7 - r; // index dans board() : 0 = rangée 8
        const file = flipped ? 7 - f : f;
        const boardRow = 7 - rank;
        const square = `${FILES[file]}${rank + 1}` as Square;
        out.push({ square, piece: board[boardRow][file], dark: (file + rank) % 2 === 0 });
      }
    }
    return out;
  });
</script>

<div class="board" role="grid" aria-label="Échiquier">
  {#each cells as c (c.square)}
    <button
      class="sq"
      class:dark={c.dark}
      class:selected={selected === c.square}
      class:last={lastMove?.includes(c.square)}
      class:check={checkSquare === c.square}
      class:target={targets.has(c.square)}
      class:capture={targets.has(c.square) && c.piece}
      class:intended={intended === c.square}
      onclick={() => onSquare?.(c.square)}
      aria-label={c.square}
    >
      {#if c.piece}
        <span class="piece" class:white={c.piece.color === "w"} class:tired={exhausted.has(c.square)}>{GLYPH[c.piece.type]}</span>
      {/if}
      {#if exhausted.has(c.square)}<span class="zz" title="Pièce épuisée">z</span>{/if}
      {#if (flipped ? c.square[1] === "8" : c.square[1] === "1")}<span class="coord file">{c.square[0]}</span>{/if}
      {#if (flipped ? c.square[0] === "h" : c.square[0] === "a")}<span class="coord rank">{c.square[1]}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    width: 100%;
    max-width: 560px;
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #6d4c2f;
  }
  .sq {
    position: relative;
    min-height: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: #f0d9b5;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .sq.dark {
    background: #b58863;
  }
  .sq.last {
    background: #cdd26a;
  }
  .sq.dark.last {
    background: #aaa23a;
  }
  .sq.selected {
    box-shadow: inset 0 0 0 4px #1565c0;
  }
  .sq.check {
    background: radial-gradient(circle, #ff5252 0%, #e53935 40%, transparent 75%);
  }
  .sq.intended {
    box-shadow: inset 0 0 0 4px #c62828;
  }
  .sq.target::after {
    content: "";
    position: absolute;
    width: 30%;
    height: 30%;
    border-radius: 50%;
    background: rgba(21, 101, 192, 0.55);
  }
  .sq.capture::after {
    width: 86%;
    height: 86%;
    background: none;
    border: 5px solid rgba(21, 101, 192, 0.6);
  }
  .piece {
    font-size: clamp(1.4rem, 7.5vw, 3rem);
    line-height: 1;
    color: #1b1b1b;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
    user-select: none;
  }
  .piece.white {
    color: #fff;
    text-shadow:
      0 0 2px #000,
      0 0 1px #000,
      0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .piece.tired {
    opacity: 0.55;
  }
  .zz {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    color: #6a1b9a;
  }
  .coord {
    position: absolute;
    font-size: 0.65rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.55);
  }
  .coord.file {
    bottom: 1px;
    right: 3px;
  }
  .coord.rank {
    top: 1px;
    left: 3px;
  }
</style>
