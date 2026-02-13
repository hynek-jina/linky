export const createSquareAvatarDataUrl = async (
  file: File,
  sizePx: number,
): Promise<string> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Unsupported file");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image load failed"));
      el.src = objectUrl;
    });

    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error("Invalid image");

    const side = Math.min(sw, sh);
    const sx = Math.floor((sw - side) / 2);
    const sy = Math.floor((sh - side) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, sizePx, sizePx);

    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
  }
};
