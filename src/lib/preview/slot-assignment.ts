/**
 * Pure helper for assigning a photo from HASIL FOTO pool to a frame slot.
 *
 * SEMANTICS: REPLACE / ASSIGN.
 * The target slot is updated to photoIndex.
 * No other slot is modified or swapped.
 * Duplicates across multiple slots are intentionally supported.
 */
export function assignPhotoToSlot(
  assignments: (number | null)[],
  photoIndex: number,
  slotIndex: number
): (number | null)[] {
  if (slotIndex < 0 || slotIndex >= assignments.length) {
    return [...assignments];
  }
  const next = [...assignments];
  next[slotIndex] = photoIndex;
  return next;
}
