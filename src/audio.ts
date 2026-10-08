import { AtmosphereSystem } from "./atmosphere";

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineOsc?: OscillatorNode;
  private sirenGain?: GainNode;
  private sirenOsc?: OscillatorNode;
  private ambientGain?: GainNode;
  private ambientOsc?: OscillatorNode;
  private noise?: AudioBuffer;
  private footstepTimer = 0;
  private sirenTimer = 0;
  private sirenHigh = false;
  private lastMission = "";
  private lastDay = true;

  unlock() {
    if (!this.context) {
      const Ctor = (window as AudioWindow).AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.context.destination);
      this.noise = this.makeNoise();
      this.makeLoops();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  update(dt: number, driving: boolean, speed: number, walking: boolean, wanted: number, atmosphere: AtmosphereSystem, mission: string) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const s = Math.abs(speed);

    if (this.engineGain && this.engineOsc) {
      this.engineGain.gain.setTargetAtTime(driving ? 0.045 + Math.min(s / 22, 1) * 0.09 : 0, now, 0.06);
      this.engineOsc.frequency.setTargetAtTime(48 + s * 3.8, now, 0.05);
    }
    if (this.sirenGain && this.sirenOsc) {
      this.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.04 : 0, now, 0.08);
      this.sirenTimer -= dt;
      if (wanted > 0 && this.sirenTimer <= 0) {
        this.sirenTimer = 0.42;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 760 : 520, now, 0.04);
      }
    }
    if (this.ambientGain && this.ambientOsc) {
      const day = atmosphere.hour >= 6 && atmosphere.hour < 18.5;
      this.ambientGain.gain.setTargetAtTime(day ? 0.01 : 0.016, now, 1);
      this.ambientOsc.frequency.setTargetAtTime(day ? 82 : 58, now, 1);
      if (day !== this.lastDay) { this.lastDay = day; this.tone(day ? 440 : 220, 0.06, 0.03); }
    }
    if (walking && !driving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) { this.footstepTimer = 0.34; this.step(); }
    }
    if (mission && mission !== this.lastMission) {
      if (mission.includes("COMPLETE")) this.tone(880, 0.12, 0.07);
      else if (mission.includes("FAILED")) this.tone(160, 0.18, 0.06);
      else if (this.lastMission) this.tone(620, 0.06, 0.03);
      this.lastMission = mission;
    }
  }

  gunshot() {
    if (!this.context || !this.master || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(now + 0.09);
    this.tone(110, 0.045, 0.05);
  }

  private makeLoops() {
    if (!this.context || !this.master) return;
    this.engineGain = this.context.createGain();
    this.engineOsc = this.context.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 50;
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    this.sirenGain = this.context.createGain();
    this.sirenOsc = this.context.createOscillator();
    this.sirenOsc.type = "square";
    this.sirenOsc.frequency.value = 520;
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();

    this.ambientGain = this.context.createGain();
    this.ambientOsc = this.context.createOscillator();
    this.ambientOsc.type = "sine";
    this.ambientOsc.frequency.value = 82;
    this.ambientGain.gain.value = 0.01;
    this.ambientOsc.connect(this.ambientGain).connect(this.master);
    this.ambientOsc.start();
  }

  private step() {
    if (!this.context || !this.master || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    source.connect(gain).connect(this.master);
    source.start();
    source.stop(now + 0.05);
  }

  private tone(frequency: number, duration: number, volume: number) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(now + duration);
  }

  private makeNoise() {
    if (!this.context) throw new Error("Audio unavailable");
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}