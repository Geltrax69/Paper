export type ClipFrameDef = {
  attachments?: Record<string, [number, number]>;
  durationMs: number;
  id: string;
};

export type ClipEventDef = {
  name: string;
  timeMs: number;
};

export type ClipDef = {
  events: ClipEventDef[];
  frames: ClipFrameDef[];
  loop: boolean;
};

// One player per animated instance. Sharing a player, or a texture offset,
// would synchronise unrelated enemies, so each enemy and weapon owns one.
export class AnimationPlayer {
  readonly clip: ClipDef;
  readonly totalMs: number;
  timeMs = 0;
  frameIndex = 0;
  finished = false;
  paused = false;
  onComplete: (() => void) | null = null;
  private fired = new Set<number>();
  private completeFired = false;

  constructor(clip: ClipDef) {
    this.clip = clip;
    this.totalMs = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  }

  get currentFrame(): ClipFrameDef {
    return this.clip.frames[this.frameIndex];
  }

  get progress01(): number {
    return this.totalMs > 0 ? this.timeMs / this.totalMs : 0;
  }

  play(startTimeMs = 0): void {
    this.timeMs = Math.max(0, Math.min(startTimeMs, Math.max(0, this.totalMs - 1)));
    this.finished = false;
    this.completeFired = false;
    this.fired = new Set(
      this.clip.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.timeMs < this.timeMs)
        .map(({ index }) => index),
    );
    this.frameIndex = this.frameIndexAt(this.timeMs);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.timeMs = 0;
    this.frameIndex = 0;
    this.finished = false;
    this.completeFired = false;
    this.fired = new Set();
  }

  // Returns event names crossed in this update, in clip order, once each.
  // A large step crosses every event in its path, and a loop wrap refires
  // only after the cycle restarts, so low frame rate cannot lose or
  // duplicate an event within one cycle.
  update(dtMs: number, rate = 1): string[] {
    if (this.paused || this.finished || dtMs <= 0 || this.totalMs <= 0) return [];
    const fired: string[] = [];
    let remaining = dtMs * rate;
    while (remaining > 0 && !this.finished) {
      const nextBoundary = this.nextBoundaryAfter(this.timeMs);
      const step = Math.min(remaining, nextBoundary - this.timeMs);
      this.timeMs += step;
      remaining -= step;
      for (let i = 0; i < this.clip.events.length; i += 1) {
        const event = this.clip.events[i];
        if (!this.fired.has(i) && event.timeMs <= this.timeMs) {
          this.fired.add(i);
          fired.push(event.name);
        }
      }
      if (this.timeMs >= this.totalMs) {
        if (this.clip.loop) {
          this.timeMs -= this.totalMs;
          this.fired = new Set();
        } else {
          this.timeMs = this.totalMs;
          this.finished = true;
          if (!this.completeFired) {
            this.completeFired = true;
            this.onComplete?.();
          }
        }
      }
      this.frameIndex = this.frameIndexAt(this.timeMs);
    }
    return fired;
  }

  // Advance to the start of the next frame, used by review stepping.
  stepFrame(): void {
    if (this.finished) return;
    const next = this.frameIndex + 1;
    if (next >= this.clip.frames.length) {
      if (this.clip.loop) {
        this.play(0);
      } else {
        this.timeMs = this.totalMs;
        this.finished = true;
      }
      return;
    }
    let start = 0;
    for (let i = 0; i < next; i += 1) start += this.clip.frames[i].durationMs;
    this.timeMs = start;
    this.frameIndex = next;
  }

  private frameIndexAt(timeMs: number): number {
    let acc = 0;
    for (let i = 0; i < this.clip.frames.length; i += 1) {
      acc += this.clip.frames[i].durationMs;
      if (timeMs < acc) return i;
    }
    return this.clip.frames.length - 1;
  }

  private nextBoundaryAfter(timeMs: number): number {
    let acc = 0;
    for (const frame of this.clip.frames) {
      acc += frame.durationMs;
      if (acc > timeMs) return acc;
    }
    return this.totalMs;
  }
}

export function clipFromManifest(clip: {
  events?: ClipEventDef[];
  frameMs?: number;
  frames?: ClipFrameDef[];
  assetIds?: string[];
  loop: boolean;
}): ClipDef {
  if (clip.frames && clip.frames.length > 0) {
    return { events: clip.events ?? [], frames: clip.frames, loop: clip.loop };
  }
  const ids = clip.assetIds ?? [];
  const frameMs = clip.frameMs ?? 1000;
  return {
    events: clip.events ?? [],
    frames: ids.map((id) => ({ durationMs: frameMs, id })),
    loop: clip.loop,
  };
}
