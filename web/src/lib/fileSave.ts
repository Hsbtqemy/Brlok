/**
 * Proposer un fichier à enregistrer. Dans une page claude.ai, le téléchargement direct est bloqué : on passe
 * par la capacité `downloads` (le visiteur confirme). Ailleurs (app installée, navigateur), lien de
 * téléchargement classique.
 */
type Downloads = { save(request: { filename: string; data: string | Blob }): Promise<{ status: string }> };

export async function saveFile(filename: string, data: string, type = "application/json"): Promise<"saved" | "declined"> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (typeof claude?.use === "function") {
    const downloads = (await claude.use("downloads").catch(() => null)) as Downloads | null;
    if (downloads) {
      try {
        await downloads.save({ filename, data: new Blob([data], { type }) });
        return "saved";
      } catch (e) {
        if ((e as { code?: string })?.code === "declined") return "declined";
        throw new Error((e as { message?: string })?.message ?? "Enregistrement impossible ici.");
      }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}
