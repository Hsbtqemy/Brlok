/** Photos de secteur : chargement, réduction, pixels pour l'analyse des couleurs. */

/** Photo enregistrée avec le mur (côté le plus long), et image d'analyse des couleurs (plus petite). */
export const PHOTO_MAX = 900;
export const DETECT_MAX = 420;

type Picture = HTMLImageElement | ImageBitmap;

const sizeOf = (p: Picture) => (p instanceof HTMLImageElement ? { w: p.naturalWidth, h: p.naturalHeight } : { w: p.width, h: p.height });

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    img.src = url;
  });
}

/**
 * Décode une photo. `createImageBitmap` d'abord (moins gourmand en mémoire pour les grandes photos
 * d'appareil, orientation de l'appareil respectée), sinon une balise image.
 */
async function decode(file: File): Promise<Picture> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // format non pris en charge par cette voie : on essaie l'autre
    }
  }
  try {
    return await loadImage(file);
  } catch {
    const kind = file.type || file.name.split(".").pop() || "inconnu";
    throw new Error(
      /heic|heif/i.test(kind)
        ? "Photo au format HEIC, que ce navigateur ne sait pas lire : sur iPhone, Réglages → Appareil photo → Formats → « Le plus compatible »."
        : `Photo illisible (format ${kind}).`,
    );
  }
}

export function scaled(img: Picture, max: number): HTMLCanvasElement {
  const { w, h } = sizeOf(img);
  const ratio = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Photo réduite et compressée (taille limitée : elle est enregistrée et partagée). */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.size) throw new Error("La photo est vide : l'appareil n'a rien renvoyé. Réessaie, ou passe par « Image… ».");
  const img = await decode(file);
  try {
    let photo = scaled(img, PHOTO_MAX).toDataURL("image/jpeg", 0.72);
    if (photo.length > 180_000) photo = scaled(img, 700).toDataURL("image/jpeg", 0.6);
    if (!photo.startsWith("data:image/jpeg")) throw new Error("Ce navigateur n'a pas pu réduire la photo.");
    return photo;
  } finally {
    if ("close" in img) img.close();
  }
}

/** Pixels d'une photo (data URL) à la résolution d'analyse. */
export async function photoPixels(photo: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = new Image();
  img.src = photo;
  await img.decode();
  const canvas = scaled(img, DETECT_MAX);
  return { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}
