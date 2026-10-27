// One shared AudioContext. iOS only lets a page play sound from an AudioContext
// that was started during a tap, so unlockAudio() must be called from one
// (the Start/Resume button) before any timed beeps can be heard.
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    // A silent blip finishes unlocking on older iOS versions.
    tone({ frequency: 440, duration: 0.01, volume: 0 });
  } catch {
    // Audio is a nice-to-have.
  }
}

interface Tone {
  frequency: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
  /** Seconds from now. */
  delay?: number;
}

function tone({ frequency, duration, volume = 0.6, type = "sine", delay = 0 }: Tone): void {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  // Short fade in/out avoids clicks.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.setValueAtTime(volume, start + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

/** Loud warning beep for the last 3 seconds of an interval. */
export function warningBeep(): void {
  tone({ frequency: 1000, duration: 0.25, volume: 1, type: "square" });
}

/** Longer, higher beep when a new interval starts. */
export function intervalBeep(): void {
  tone({ frequency: 1500, duration: 0.6, volume: 1, type: "square" });
}

/** Rising three-note chime at the end of the workout. */
export function finishChime(): void {
  [880, 1100, 1320].forEach((frequency, i) => tone({ frequency, duration: 0.3, volume: 0.8, delay: i * 0.25 }));
}
