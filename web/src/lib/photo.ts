/** Photos de secteur : chargement, réduction, pixels pour l'analyse des couleurs. */

/** Photo enregistrée avec le mur (côté le plus long), et image d'analyse des couleurs (plus petite). */
export const PHOTO_MAX = 900;
export const DETECT_MAX = 420;

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = URL.createObjectURL(file);
  });
}

export function scaled(img: HTMLImageElement, max: number): HTMLCanvasElement {
  const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Photo réduite et compressée (taille limitée : elle est enregistrée et partagée). */
export async function photoFromFile(file: File): Promise<string> {
  const img = await loadImage(file);
  let photo = scaled(img, PHOTO_MAX).toDataURL("image/jpeg", 0.72);
  if (photo.length > 180_000) photo = scaled(img, 700).toDataURL("image/jpeg", 0.6);
  return photo;
}

/** Pixels d'une photo (data URL) à la résolution d'analyse. */
export async function photoPixels(photo: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = new Image();
  img.src = photo;
  await img.decode();
  const canvas = scaled(img, DETECT_MAX);
  return { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}
