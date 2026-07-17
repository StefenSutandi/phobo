export type FitMode = "cover" | "contain" | "smart-cover";

export function computePhotoFit(
  sourceWidth: number,
  sourceHeight: number,
  slotWidth: number,
  slotHeight: number,
  mode: FitMode = "smart-cover"
) {
  let finalMode = mode;
  const sourceRatio = sourceWidth / sourceHeight;
  const slotRatio = slotWidth / slotHeight;

  if (mode === "smart-cover") {
    // If it's a portrait slot and source is landscape, use contain to avoid chopping sides
    if (slotRatio < 0.8 && sourceRatio > 1.2) {
      finalMode = "contain";
    } else {
      finalMode = "cover";
    }
  }

  let sw = sourceWidth;
  let sh = sourceHeight;
  let sx = 0;
  let sy = 0;

  let dw = slotWidth;
  let dh = slotHeight;
  let dx = 0;
  let dy = 0;

  if (finalMode === "cover") {
    if (sourceRatio > slotRatio) {
      // Source is wider than slot. Crop sides.
      sw = sourceHeight * slotRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      // Source is taller than slot. Crop top/bottom.
      sh = sourceWidth / slotRatio;
      sy = (sourceHeight - sh) / 2; // Center vertical crop
    }
  } else if (finalMode === "contain") {
    if (sourceRatio > slotRatio) {
      // Source is wider than slot. Letterbox top/bottom.
      dh = slotWidth / sourceRatio;
      dy = slotHeight - dh; // ANCHOR TO BOTTOM for natural placement!
    } else {
      // Source is taller than slot. Pillarbox left/right.
      dw = slotHeight * sourceRatio;
      dx = (slotWidth - dw) / 2;
    }
  }

  return { 
    sx: Math.round(sx), 
    sy: Math.round(sy), 
    sw: Math.round(sw), 
    sh: Math.round(sh), 
    dx: Math.round(dx), 
    dy: Math.round(dy), 
    dw: Math.round(dw), 
    dh: Math.round(dh),
    finalMode
  };
}
