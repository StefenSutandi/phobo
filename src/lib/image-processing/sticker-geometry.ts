/**
 * Pure helper for sticker coordinate calculations.
 *
 * CANONICAL CONTRACT:
 * - Canvas coordinate space: 1200 x 1800
 * - sticker.x = CENTER X on 1200 canvas
 * - sticker.y = CENTER Y on 1800 canvas
 * - sticker.width = visual unrotated width
 * - sticker.rotation = degrees rotated around sticker CENTER
 *
 * Top-left placement for Sharp composition:
 * - left = Math.round(sticker.x - rotatedBufferWidth / 2)
 * - top = Math.round(sticker.y - rotatedBufferHeight / 2)
 */
export function computeStickerPlacement(
  sticker: { x: number; y: number },
  rotatedBufferWidth: number,
  rotatedBufferHeight: number
): { left: number; top: number; centerX: number; centerY: number } {
  const left = Math.round(sticker.x - rotatedBufferWidth / 2);
  const top = Math.round(sticker.y - rotatedBufferHeight / 2);
  const centerX = left + rotatedBufferWidth / 2;
  const centerY = top + rotatedBufferHeight / 2;

  return { left, top, centerX, centerY };
}
