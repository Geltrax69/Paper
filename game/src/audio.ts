export type AudioState = {
  counts: Record<string, number>;
  ctxState: string;
  gain: number;
  initialized: boolean;
  muted: boolean;
  volume: number;
};

// Every sound here is synthesized with the Web Audio API. No audio asset
// files exist for this game, so there is nothing to download or license.
export class GameAudio {
  volume = 0.8;
  muted = false;
  counts: Record<string, number> = {};
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  get initialized(): boolean {
    return this.ctx !== null;
  }

  get ctxState(): string {
    return this.ctx ? this.ctx.state : "none";
  }

  get gain(): number {
    return this.master ? this.master.gain.value : 0;
  }

  // Call only from a user gesture handler, so the browser allows playback.
  init(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    this.applyGain();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyGain();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.applyGain();
  }

  state(): AudioState {
    return {
      counts: { ...this.counts },
      ctxState: this.ctxState,
      gain: this.gain,
      initialized: this.initialized,
      muted: this.muted,
      volume: this.volume,
    };
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private count(name: string): void {
    this.counts[name] = (this.counts[name] ?? 0) + 1;
  }

  private tone(
    startHz: number,
    endHz: number,
    durationMs: number,
    type: OscillatorType,
    peak: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), now + durationMs / 1000);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  }

  private noise(durationMs: number, filterHz: number, peak: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const length = Math.max(1, Math.floor((this.ctx.sampleRate * durationMs) / 1000));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }

  shot(): void {
    this.count("shot");
    this.noise(140, 3000, 0.5);
    this.tone(160, 55, 140, "square", 0.25);
  }

  pistol(): void {
    this.count("pistol");
    this.noise(70, 4000, 0.35);
    this.tone(900, 300, 70, "square", 0.2);
  }

  automatic(): void {
    this.count("automatic");
    this.noise(90, 3500, 0.35);
    this.tone(220, 90, 90, "square", 0.2);
  }

  blaster(): void {
    this.count("blaster");
    this.tone(1200, 300, 220, "sawtooth", 0.25);
    this.noise(180, 5000, 0.2);
  }

  knifeThrow(): void {
    this.count("knifeThrow");
    this.noise(120, 6000, 0.25);
  }

  grenadeThrow(): void {
    this.count("grenadeThrow");
    this.tone(500, 700, 100, "sine", 0.2);
  }

  shock(): void {
    this.count("shock");
    this.noise(400, 400, 0.5);
    this.tone(200, 50, 400, "sine", 0.4);
  }

  reload(): void {
    this.count("reload");
    this.tone(700, 700, 70, "square", 0.15);
    setTimeout(() => this.tone(1100, 1100, 70, "square", 0.15), 120);
  }

  impact(): void {
    this.count("impact");
    this.noise(80, 1200, 0.4);
  }

  explosion(): void {
    this.count("explosion");
    this.noise(500, 300, 0.5);
    this.tone(120, 40, 450, "sine", 0.4);
  }

  footstep(): void {
    this.count("footstep");
    this.noise(60, 400, 0.18);
  }

  monsterAttack(): void {
    this.count("monsterAttack");
    this.tone(220, 110, 200, "sawtooth", 0.2);
  }

  jump(): void {
    this.count("jump");
    this.tone(300, 600, 120, "sine", 0.2);
  }

  land(): void {
    this.count("land");
    this.noise(100, 500, 0.3);
    this.tone(90, 60, 100, "sine", 0.2);
  }

  pickup(): void {
    this.count("pickup");
    this.tone(660, 660, 90, "sine", 0.25);
    setTimeout(() => this.tone(880, 880, 120, "sine", 0.25), 90);
  }

  waveComplete(): void {
    this.count("waveComplete");
    const notes = [523, 659, 784];
    notes.forEach((note, i) => {
      setTimeout(() => this.tone(note, note, 160, "sine", 0.25), i * 140);
    });
  }

  grapple(): void {
    this.count("grapple");
    this.tone(500, 900, 120, "sine", 0.2);
  }

  insectLeap(): void {
    this.count("insectLeap");
    this.tone(400, 950, 150, "sine", 0.22);
    this.noise(120, 2400, 0.2);
  }

  bruteWindup(): void {
    this.count("bruteWindup");
    this.tone(90, 60, 300, "sawtooth", 0.25);
  }

  bruteSlam(): void {
    this.count("bruteSlam");
    this.noise(220, 350, 0.5);
    this.tone(110, 35, 220, "sine", 0.4);
  }

  melee(): void {
    this.count("melee");
    this.noise(100, 2000, 0.3);
  }

  playerDamage(): void {
    this.count("playerDamage");
    this.tone(160, 80, 200, "square", 0.3);
  }
}
