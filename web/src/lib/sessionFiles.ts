/**
 * Export d'une séance en fichier (texte, Markdown, JSON) ou en PDF. Le PDF passe par l'impression du
 * navigateur (« Enregistrer en PDF ») : une feuille à part, avec la grille du pan pour chaque bloc.
 */
import { blockLabel } from "../core/library";
import { blockLines, headerLines, sessionFileName, sessionJson, sessionMarkdown, sessionText, type SessionDoc } from "../core/sessionExport";
import { holdAt, type Wall } from "../core/wall";
import { saveFile } from "./fileSave";

export type ExportFormat = "txt" | "md" | "json" | "pdf";

export const EXPORT_FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "pdf", label: "PDF (imprimer)" },
  { id: "txt", label: "Texte" },
  { id: "md", label: "Markdown" },
  { id: "json", label: "JSON" },
];

/** Exporte ; renvoie un message pour l'utilisateur. */
export async function exportSession(doc: SessionDoc, format: ExportFormat, wall?: Wall): Promise<string> {
  if (format === "pdf") {
    printSession(doc, wall);
    return "Feuille prête : choisis « Enregistrer en PDF » ou une imprimante.";
  }
  const [data, type] =
    format === "txt"
      ? [sessionText(doc), "text/plain;charset=utf-8"]
      : format === "md"
        ? [sessionMarkdown(doc), "text/markdown;charset=utf-8"]
        : [sessionJson(doc), "application/json"];
  const result = await saveFile(sessionFileName(doc, format), data, type);
  return result === "saved" ? "Séance exportée." : "Export annulé.";
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Grille du pan, prises du bloc numérotées (bas du mur en bas, comme à l'écran). */
function gridHtml(wall: Wall, ids: string[]): string {
  const rank = new Map(ids.map((id, i) => [id, i + 1]));
  const rows = Array.from({ length: wall.rows }, (_, i) => (wall.bottom === "last" ? i : wall.rows - 1 - i));
  const body = rows
    .map(
      (row) =>
        `<tr>${Array.from({ length: wall.cols }, (_, col) => {
          const hold = holdAt(wall, { row, col });
          const n = hold ? rank.get(hold.id) : undefined;
          return `<td class="${n ? "on" : hold ? "hold" : ""}">${n ?? (hold ? "·" : "")}</td>`;
        }).join("")}</tr>`,
    )
    .join("");
  return `<table class="grid">${body}</table>`;
}

export function sessionSheetHtml(doc: SessionDoc, wall?: Wall): string {
  const blocks = doc.blocks
    .map((b, i) => {
      const lines = blockLines(b).map((l) => `<p>${esc(l)}</p>`).join("");
      const grid = !b.route && wall && b.holds.length ? gridHtml(wall, b.holds.map((h) => h.id)) : "";
      const comment = b.comment ? `<p class="comment">${esc(b.comment)}</p>` : "";
      return `<section class="block"><h2>${b.route ? "Voie" : "Bloc"} ${i + 1} · ${esc(blockLabel(b))}</h2><div class="body">${grid}<div>${lines}${comment}</div></div></section>`;
    })
    .join("");
  return `<h1>Séance d'entraînement Brlok</h1>${headerLines(doc)
    .map((l) => `<p class="meta">${esc(l)}</p>`)
    .join("")}${blocks}`;
}

/** Imprime la feuille de séance (la page de l'app est masquée le temps de l'impression). */
export function printSession(doc: SessionDoc, wall?: Wall): void {
  document.getElementById("print-root")?.remove();
  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = sessionSheetHtml(doc, wall);
  document.body.appendChild(root);
  document.body.classList.add("printing");
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    root.remove();
    document.body.classList.remove("printing");
    window.removeEventListener("afterprint", done);
    window.removeEventListener("focus", done);
  };
  window.addEventListener("afterprint", done);
  // Sans « afterprint » (certains navigateurs mobiles), la feuille est retirée au prochain retour dans l'app.
  setTimeout(() => {
    if (!finished) window.addEventListener("focus", done, { once: true });
  }, 1000);
  window.print();
}
