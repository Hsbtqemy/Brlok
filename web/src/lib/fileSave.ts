/** Proposer un fichier à enregistrer (lien de téléchargement). */
export async function saveFile(filename: string, data: string, type = "application/json"): Promise<"saved" | "declined"> {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}
