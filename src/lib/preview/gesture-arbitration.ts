export type GestureClassification = "tap" | "scroll" | "drag" | "pending";

/**
 * Classifies pointer movement between touch/mouse start point and current point.
 *
 * Rules:
 * - Movement < 8px: "tap" (candidate for tap/click)
 * - Movement >= 8px:
 *   - If Math.abs(dy) > Math.abs(dx) * 1.2: "scroll" (vertical scroll in HASIL FOTO)
 *   - If Math.abs(dx) >= Math.abs(dy) * 0.6: "drag" (horizontal/diagonal drag toward frame)
 *   - Otherwise: "pending"
 */
export function classifyPointerGesture(
  dx: number,
  dy: number,
  distanceThreshold = 8
): GestureClassification {
  const distance = Math.hypot(dx, dy);
  if (distance < distanceThreshold) {
    return "tap";
  }

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absY > absX * 1.2) {
    return "scroll";
  }

  if (absX >= absY * 0.6) {
    return "drag";
  }

  return "pending";
}
