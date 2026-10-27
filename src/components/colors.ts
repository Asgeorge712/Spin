/** At or below this resistance is the easiest green. */
export const EASY_RESISTANCE = 25;
/** At or above this resistance is the hardest red. */
export const HARD_RESISTANCE = 55;

/** Maps resistance onto a green → yellow → red hue ramp between EASY_RESISTANCE and HARD_RESISTANCE. */
export function resistanceColor(resistance: number): string {
  const t = Math.min(1, Math.max(0, (resistance - EASY_RESISTANCE) / (HARD_RESISTANCE - EASY_RESISTANCE)));
  const hue = 140 - t * 140;
  return `hsl(${hue.toFixed(0)} 70% 48%)`;
}
