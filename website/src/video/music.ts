/**
 * The soundtrack, synthesised in the browser.
 *
 * There is no audio file: pads, bass, percussion, arpeggios and every sound
 * effect are built from oscillators and a noise buffer, scheduled against the
 * same clock as the picture. That keeps the page self-contained (and makes the
 * edit re-timable), at the cost of a bit of Web Audio plumbing.
 *
 * The arrangement follows the storyboard: a sparse intro, a steady 96 BPM flow
 * under the feature shots, a stripped-back focus section for the privacy shot,
 * a wider sync section, and a pad-only outro.
 */

import { SCENES, TOTAL_DURATION, sceneIndexAt, type SfxName } from "./storyboard";

type Cue = "intro" | "flow" | "feature" | "focus" | "sync" | "outro";

const BPM = 96;
const STEP = 60 / BPM / 4; // one sixteenth note, in seconds

const CUE_BY_SCENE: Record<string, Cue> = {
  hook: "intro",
  summon: "intro",
  ui: "flow",
  paste: "flow",
  media: "flow",
  search: "flow",
  rules: "flow",
  ocr: "feature",
  queue: "feature",
  private: "focus",
  sync: "sync",
  outro: "outro",
};

interface Chord {
  /** MIDI notes for the pad and arpeggio. */
  notes: number[];
  /** MIDI note for the bass. */
  bass: number;
}

/** Am7 – Fmaj7 – Cmaj7 – G6, one bar each. */
const CHORDS: Chord[] = [
  { notes: [57, 60, 64, 67], bass: 45 },
  { notes: [53, 57, 60, 64], bass: 41 },
  { notes: [48, 52, 55, 59], bass: 36 },
  { notes: [55, 59, 62, 64], bass: 43 },
];

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

function cueAt(videoTime: number): Cue {
  const scene = SCENES[sceneIndexAt(videoTime)];
  return CUE_BY_SCENE[scene.id] ?? "flow";
}

function cutoffFor(cue: Cue): number {
  switch (cue) {
    case "intro":
      return 900;
    case "flow":
      return 1500;
    case "feature":
      return 2100;
    case "focus":
      return 700;
    case "sync":
      return 2600;
    case "outro":
      return 1000;
  }
}

function hasDrums(cue: Cue): boolean {
  return cue === "flow" || cue === "feature" || cue === "sync";
}

function noiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class PromoMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private padBus: BiquadFilterNode | null = null;
  private arpBus: GainNode | null = null;
  private bassBus: GainNode | null = null;
  private drumBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextStep = 0;
  private nextTime = 0;
  private enabled = true;
  private volume = 0.9;

  get running(): boolean {
    return this.context !== null;
  }

  /** Rebuilds the graph and starts scheduling at `videoTime` seconds. */
  start(videoTime: number) {
    this.stop();
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const context = new AudioCtor();
    this.context = context;
    this.noise = noiseBuffer(context);

    const master = context.createGain();
    master.gain.value = this.enabled ? this.volume * 0.22 : 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;
    master.connect(compressor).connect(context.destination);
    this.master = master;

    const padBus = context.createBiquadFilter();
    padBus.type = "lowpass";
    padBus.frequency.value = 1200;
    padBus.Q.value = 0.6;
    padBus.connect(master);
    this.padBus = padBus;

    const arpBus = context.createGain();
    arpBus.gain.value = 0.9;
    arpBus.connect(master);
    this.arpBus = arpBus;

    const bassBus = context.createGain();
    bassBus.gain.value = 1;
    bassBus.connect(master);
    this.bassBus = bassBus;

    const drumBus = context.createGain();
    drumBus.gain.value = 1;
    drumBus.connect(master);
    this.drumBus = drumBus;

    void context.resume();

    // Start at the next sixteenth so a seek mid-step does not fire a burst of
    // notes that belong to the moment we just skipped.
    const startStep = Math.max(0, Math.round(videoTime / STEP));
    this.nextStep = startStep;
    this.nextTime = context.currentTime + (startStep * STEP - videoTime);
    this.timer = window.setInterval(() => this.pump(), 40);
    this.pump();
  }

  /** Stops the scheduler and releases the audio device. */
  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const context = this.context;
    this.context = null;
    this.master = null;
    this.padBus = null;
    this.arpBus = null;
    this.bassBus = null;
    this.drumBus = null;
    this.noise = null;
    if (context) {
      void context.close().catch(() => {});
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!this.master || !this.context) return;
    const target = enabled ? this.volume * 0.22 : 0;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.context.currentTime + 0.15);
  }

  playSfx(name: SfxName) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.enabled) return;
    const when = context.currentTime + 0.005;
    switch (name) {
      case "whoosh":
        this.noiseSweep(when, 0.38, 260, 2600, 0.1);
        break;
      case "pop":
        this.tone(master, 620, when, 0.11, "sine", 0.1, 0.004, 0.08, 280);
        break;
      case "click":
        this.tone(master, 1500, when, 0.025, "square", 0.035, 0.002, 0.02);
        break;
      case "chime":
        this.tone(master, 880, when, 0.5, "sine", 0.055, 0.005, 0.4);
        this.tone(master, 1320, when + 0.09, 0.55, "sine", 0.04, 0.005, 0.45);
        break;
      case "lock":
        this.tone(master, 130, when, 0.22, "sine", 0.14, 0.004, 0.2, 55);
        this.tone(master, 1800, when + 0.02, 0.03, "square", 0.03, 0.002, 0.02);
        break;
      case "sync":
        this.tone(master, 660, when, 0.18, "sine", 0.05, 0.005, 0.14);
        this.tone(master, 990, when + 0.12, 0.22, "sine", 0.045, 0.005, 0.18);
        break;
      case "riser":
        this.noiseSweep(when, 1.1, 200, 5200, 0.045);
        break;
    }
  }

  /** Schedules every sixteenth that falls inside the look-ahead window. */
  private pump() {
    const context = this.context;
    if (!context) return;

    // If the tab was backgrounded, the audio clock can be far ahead of the
    // scheduler. Skip the missed steps instead of firing them all at once.
    if (this.nextTime < context.currentTime - 0.25) {
      const skipped = Math.ceil((context.currentTime - this.nextTime) / STEP);
      this.nextStep += skipped;
      this.nextTime += skipped * STEP;
    }

    // The picture is over; let the last chord ring out but stop scheduling.
    if (this.nextStep * STEP > TOTAL_DURATION + 2) {
      if (this.timer !== null) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }

    const horizon = context.currentTime + 0.18;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.nextStep, this.nextTime);
      this.nextStep += 1;
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, when: number) {
    const context = this.context;
    const padBus = this.padBus;
    const arpBus = this.arpBus;
    const bassBus = this.bassBus;
    const drumBus = this.drumBus;
    if (!context || !padBus || !arpBus || !bassBus || !drumBus) return;

    const videoTime = step * STEP;
    if (videoTime > TOTAL_DURATION) return;

    const cue = cueAt(videoTime);
    const inBar = step % 16;
    const bar = Math.floor(step / 16) % CHORDS.length;
    const chord = CHORDS[bar];
    const sectionStart = Math.floor(videoTime / (STEP * 16));

    // The pad filter opens across the picture instead of jumping at cuts.
    padBus.frequency.setTargetAtTime(cutoffFor(cue), when, 0.4);

    if (inBar === 0) {
      this.pad(padBus, chord, when, STEP * 16, cue);
    }

    const drums = hasDrums(cue);
    const dense = cue === "feature" || cue === "sync";

    if (drums) {
      if (inBar === 0 || inBar === 8) this.kick(drumBus, when);
      if (dense && (inBar === 4 || inBar === 12)) this.snare(drumBus, when);
      if (inBar % 2 === 0) this.hat(drumBus, when, inBar % 4 === 0 ? 0.05 : 0.028);
    }

    if (cue === "focus") {
      if (inBar === 0) this.kick(drumBus, when, 0.6);
      if (inBar === 10) this.kick(drumBus, when, 0.35);
    }

    const bassPattern: Record<Cue, number[]> = {
      intro: [0],
      flow: [0, 6, 8, 14],
      feature: [0, 6, 8, 12, 14],
      focus: [0, 10],
      sync: [0, 4, 8, 12],
      outro: [0],
    };
    if (bassPattern[cue].includes(inBar)) {
      const length = cue === "intro" || cue === "outro" ? 0.9 : 0.32;
      this.bass(bassBus, chord.bass, when, length, cue === "focus" ? 0.11 : 0.15);
    }

    const arpEvery = cue === "intro" ? 4 : cue === "focus" ? 8 : 2;
    if (inBar % arpEvery === 0) {
      const pattern = [0, 2, 1, 3, 2, 1, 3, 0];
      const note = chord.notes[pattern[(step / arpEvery) % pattern.length]] + 12;
      const gain = cue === "intro" ? 0.018 : cue === "focus" ? 0.02 : 0.034;
      this.tone(arpBus, midi(note), when, 0.22, "triangle", gain, 0.004, 0.2);
      if (cue === "sync" && inBar % 4 === 0) {
        this.tone(arpBus, midi(note + 12), when + 0.06, 0.5, "sine", 0.018, 0.01, 0.45);
      }
    }

    // A small motif over the feature shots, placed on the off-beat so it does
    // not fight the typing and card animations on the down-beats.
    if (cue === "feature" && sectionStart % 2 === 1 && (inBar === 7 || inBar === 11)) {
      const melody = chord.notes[(bar + 2) % chord.notes.length] + 12;
      this.tone(arpBus, midi(melody), when, 0.4, "sine", 0.028, 0.01, 0.35);
    }

    if (cue === "outro" && inBar === 0 && bar === 0) {
      // The last chord is left ringing; no further notes are scheduled after
      // the total duration, so it tails out naturally.
      this.tone(padBus, midi(chord.notes[0] + 12), when, 3.4, "sine", 0.02, 0.3, 2.8);
    }
  }

  private pad(destination: AudioNode, chord: Chord, when: number, duration: number, cue: Cue) {
    const gain = cue === "focus" ? 0.03 : cue === "intro" || cue === "outro" ? 0.026 : 0.022;
    for (const note of chord.notes) {
      this.tone(destination, midi(note), when, duration, "sawtooth", gain, 0.4, 0.7, undefined, -6);
      this.tone(destination, midi(note), when, duration, "sine", gain * 0.7, 0.3, 0.8, undefined, 6);
    }
  }

  private bass(destination: AudioNode, note: number, when: number, duration: number, gain: number) {
    this.tone(destination, midi(note), when, duration, "sine", gain, 0.012, 0.2);
    this.tone(destination, midi(note + 12), when, duration * 0.6, "triangle", gain * 0.35, 0.008, 0.12);
  }

  private kick(destination: AudioNode, when: number, scale = 1) {
    this.tone(destination, 132, when, 0.16, "sine", 0.35 * scale, 0.002, 0.14, 44);
  }

  private snare(destination: AudioNode, when: number) {
    const context = this.context;
    const noise = this.noise;
    if (!context || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.11, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    source.connect(filter).connect(gain).connect(destination);
    source.start(when);
    source.stop(when + 0.15);
  }

  private hat(destination: AudioNode, when: number, level: number) {
    const context = this.context;
    const noise = this.noise;
    if (!context || !noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7200;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    source.connect(filter).connect(gain).connect(destination);
    source.start(when);
    source.stop(when + 0.06);
  }

  private noiseSweep(
    when: number,
    duration: number,
    fromHz: number,
    toHz: number,
    level: number,
  ) {
    const context = this.context;
    const noise = this.noise;
    const master = this.master;
    if (!context || !noise || !master) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(fromHz, when);
    filter.frequency.exponentialRampToValueAtTime(toHz, when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(level, when + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }

  private tone(
    destination: AudioNode,
    frequency: number,
    when: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    attack: number,
    release: number,
    endFrequency?: number,
    detune = 0,
  ) {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
    }
    if (detune !== 0) oscillator.detune.value = detune;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);

    oscillator.connect(gain).connect(destination);
    oscillator.start(when);
    oscillator.stop(when + duration + release + 0.02);
  }
}

export const promoMusic = new PromoMusic();
