import { MAX_RESISTANCE, MIN_RESISTANCE } from "../workout";

/** Maps resistance onto a green → yellow → red hue ramp. */
export function resistanceColor(resistance: number): string {
  const t = (resistance - MIN_RESISTANCE) / (MAX_RESISTANCE - MIN_RESISTANCE);
  const hue = 140 - t * 140;
  return `hsl(${hue.toFixed(0)} 70% 48%)`;
}
