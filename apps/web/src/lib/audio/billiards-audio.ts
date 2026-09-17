"use client";

/**
 * Procedural Web Audio synthesizer for Billiards.
 * Zero external audio files required -- eliminates network loading failures,
 * supports dynamic velocity-based pitch/volume scaling, and works across
 * modern desktop and mobile browsers.
 */

class BilliardsAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Sound of cue stick striking the cue ball.
   * Power ranges from 0.08 to 1.0.
   */
  public playCueStrike(power: number = 0.5) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const clampedPower = Math.max(0.1, Math.min(1, power));
    const now = ctx.currentTime;

    // Transient impulse (leather tip impact)
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1400 + clampedPower * 600, now);
    noiseFilter.Q.setValueAtTime(3, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(clampedPower * 0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    // Resonant wooden pop
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320 + clampedPower * 180, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    oscGain.gain.setValueAtTime(clampedPower * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Sound of two resin balls colliding.
   * Speed relative scale 0.1 to 1.0.
   */
  public playBallClash(intensity: number = 0.5) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const clamped = Math.max(0.1, Math.min(1, intensity));
    const now = ctx.currentTime;

    // High frequency sharp resin "clack"
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(2800 + clamped * 400, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.035);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1600 + clamped * 300, now);
    osc2.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(clamped * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.045);
    osc2.stop(now + 0.045);
  }

  /**
   * Sound of a ball bouncing off a cushioned rail bumper.
   */
  public playCushionBounce(intensity: number = 0.5) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const clamped = Math.max(0.1, Math.min(1, intensity));
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.07);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(250, now);

    gain.gain.setValueAtTime(clamped * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Sound of a ball dropping into the pocket.
   */
  public playPocketDrop() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Deep pocket cup impact
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    // Subtle leather/net rattle
    setTimeout(() => {
      if (this.muted) return;
      const ctx2 = this.getContext();
      if (!ctx2) return;
      const t = ctx2.currentTime;
      const rattle = ctx2.createOscillator();
      const rGain = ctx2.createGain();
      rattle.type = "triangle";
      rattle.frequency.setValueAtTime(280, t);
      rattle.frequency.exponentialRampToValueAtTime(110, t + 0.1);
      rGain.gain.setValueAtTime(0.25, t);
      rGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      rattle.connect(rGain);
      rGain.connect(ctx2.destination);
      rattle.start(t);
      rattle.stop(t + 0.11);
    }, 70);
  }
}

export const billiardsAudio = new BilliardsAudioEngine();
