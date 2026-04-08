import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";

type EffectName =
  | "hover"
  | "click"
  | "confirm"
  | "warning"
  | "tactical"
  | "transition"
  | "intro"
  | "tutorial"
  | "alert"
  | "emergency"
  | "success"
  | "error"
  | "unlock"
  | "incident";
export type AmbienceProfile =
  | "calm"
  | "command"
  | "engineering"
  | "research"
  | "risk"
  | "action"
  | "debrief"
  | "emergency";

interface AudioSettings {
  enabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  reducedSensoryMode: boolean;
}

interface AudioContextValue {
  settings: AudioSettings;
  isAudioReady: boolean;
  isAudioEnabled: boolean;
  ambienceProfile: AmbienceProfile;
  unlockAudio: () => Promise<void>;
  setAudioEnabled: (enabled: boolean) => Promise<void>;
  toggleAudioEnabled: () => Promise<void>;
  setAmbienceProfile: (profile: AmbienceProfile) => void;
  playEffect: (effect: EffectName) => void;
  updateSettings: (next: Partial<AudioSettings>) => void;
}

type AmbientEngine = { stop: () => void };

const STORAGE_KEY = "orbital-directive-audio";

const defaultSettings: AudioSettings = {
  enabled: false,
  musicVolume: 0.34,
  effectsVolume: 0.42,
  muted: false,
  reducedSensoryMode: false
};

const AudioControllerContext = createContext<AudioContextValue | null>(null);

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const maybeWindow = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return maybeWindow.AudioContext ?? maybeWindow.webkitAudioContext;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function readStoredSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultSettings.enabled,
      musicVolume: typeof parsed.musicVolume === "number" ? clamp01(parsed.musicVolume) : defaultSettings.musicVolume,
      effectsVolume: typeof parsed.effectsVolume === "number" ? clamp01(parsed.effectsVolume) : defaultSettings.effectsVolume,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : defaultSettings.muted,
      reducedSensoryMode:
        typeof parsed.reducedSensoryMode === "boolean" ? parsed.reducedSensoryMode : defaultSettings.reducedSensoryMode
    };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings: AudioSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function createImpulseResponse(context: AudioContext, seconds = 1.8, decay = 2.6): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }

  return impulse;
}

function createNoiseBuffer(context: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * 0.32;
  }
  return buffer;
}

function playTone(
  context: AudioContext,
  output: AudioNode,
  {
    startAt,
    duration,
    type,
    frequency,
    endFrequency,
    gain,
    filterFrequency
  }: {
    startAt: number;
    duration: number;
    type: OscillatorType;
    frequency: number;
    endFrequency?: number;
    gain: number;
    filterFrequency: number;
  }
): void {
  const oscillator = context.createOscillator();
  const amp = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startAt + duration);
  }

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterFrequency, startAt);

  amp.gain.setValueAtTime(0.0001, startAt);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startAt + 0.018);
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(filter);
  filter.connect(amp);
  amp.connect(output);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.03);
  oscillator.onended = () => {
    oscillator.disconnect();
    filter.disconnect();
    amp.disconnect();
  };
}

function playNoiseSweep(
  context: AudioContext,
  output: AudioNode,
  {
    startAt,
    duration,
    gain,
    filterStart,
    filterEnd
  }: {
    startAt: number;
    duration: number;
    gain: number;
    filterStart: number;
    filterEnd: number;
  }
): void {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();

  source.buffer = createNoiseBuffer(context, Math.max(0.18, duration + 0.12));
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterStart, startAt);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), startAt + duration);
  filter.Q.value = 0.4;

  amp.gain.setValueAtTime(0.0001, startAt);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startAt + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  source.connect(filter);
  filter.connect(amp);
  amp.connect(output);

  source.start(startAt);
  source.stop(startAt + duration + 0.06);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    amp.disconnect();
  };
}

interface AmbienceProfileConfig {
  root: number;
  accent: number;
  texture: number;
  pulseMs: number;
  pulseGain: number;
  filterFrequency: number;
  noiseFrequency: number;
  lfoRate: number;
}

function getAmbienceConfig(profile: AmbienceProfile, reducedSensoryMode: boolean): AmbienceProfileConfig {
  const scale = reducedSensoryMode ? 1.32 : 1;
  const pulse = (ms: number) => Math.round(ms * scale);
  switch (profile) {
    case "command":
      return {
        root: 80,
        accent: 121,
        texture: 162,
        pulseMs: pulse(9200),
        pulseGain: 0.018,
        filterFrequency: 1080,
        noiseFrequency: 700,
        lfoRate: reducedSensoryMode ? 0.024 : 0.044
      };
    case "engineering":
      return {
        root: 69,
        accent: 104,
        texture: 148,
        pulseMs: pulse(7800),
        pulseGain: 0.022,
        filterFrequency: 980,
        noiseFrequency: 560,
        lfoRate: reducedSensoryMode ? 0.03 : 0.052
      };
    case "research":
      return {
        root: 96,
        accent: 144,
        texture: 214,
        pulseMs: pulse(10200),
        pulseGain: 0.017,
        filterFrequency: 1320,
        noiseFrequency: 760,
        lfoRate: reducedSensoryMode ? 0.022 : 0.038
      };
    case "risk":
      return {
        root: 88,
        accent: 133,
        texture: 188,
        pulseMs: pulse(8600),
        pulseGain: 0.02,
        filterFrequency: 1160,
        noiseFrequency: 780,
        lfoRate: reducedSensoryMode ? 0.032 : 0.056
      };
    case "action":
      return {
        root: 102,
        accent: 156,
        texture: 224,
        pulseMs: pulse(6600),
        pulseGain: 0.028,
        filterFrequency: 1380,
        noiseFrequency: 880,
        lfoRate: reducedSensoryMode ? 0.036 : 0.072
      };
    case "debrief":
      return {
        root: 64,
        accent: 96,
        texture: 139,
        pulseMs: pulse(12800),
        pulseGain: 0.013,
        filterFrequency: 820,
        noiseFrequency: 480,
        lfoRate: reducedSensoryMode ? 0.018 : 0.03
      };
    case "emergency":
      return {
        root: 114,
        accent: 172,
        texture: 246,
        pulseMs: pulse(5200),
        pulseGain: 0.034,
        filterFrequency: 1520,
        noiseFrequency: 980,
        lfoRate: reducedSensoryMode ? 0.042 : 0.086
      };
    case "calm":
    default:
      return {
        root: 72,
        accent: 108,
        texture: 152,
        pulseMs: pulse(11800),
        pulseGain: 0.014,
        filterFrequency: 900,
        noiseFrequency: 620,
        lfoRate: reducedSensoryMode ? 0.02 : 0.036
      };
  }
}

export function AudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AudioSettings>(readStoredSettings);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [ambienceProfile, setAmbienceProfileState] = useState<AmbienceProfile>("calm");

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const effectsGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<AmbientEngine | null>(null);
  const lastEffectAtRef = useRef<Partial<Record<EffectName, number>>>({});

  const stopAmbient = useCallback(() => {
    const ambient = ambientRef.current;
    if (!ambient) {
      return;
    }

    ambient.stop();
    ambientRef.current = null;
  }, []);

  const ensureGraph = useCallback(() => {
    if (audioContextRef.current && masterGainRef.current && musicGainRef.current && effectsGainRef.current) {
      return true;
    }

    const Ctor = getAudioContextConstructor();
    if (!Ctor) {
      return false;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new Ctor();
    }

    const context = audioContextRef.current;
    if (!context) {
      return false;
    }

    if (!masterGainRef.current) {
      const master = context.createGain();
      const music = context.createGain();
      const effects = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const convolver = context.createConvolver();
      const reverb = context.createGain();

      compressor.threshold.value = -24;
      compressor.knee.value = 22;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.014;
      compressor.release.value = 0.19;

      convolver.buffer = createImpulseResponse(context);
      reverb.gain.value = 0.22;

      master.gain.value = 0;
      music.gain.value = 0;
      effects.gain.value = 0;

      music.connect(master);
      effects.connect(master);
      effects.connect(convolver);
      convolver.connect(reverb);
      reverb.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);

      masterGainRef.current = master;
      musicGainRef.current = music;
      effectsGainRef.current = effects;
      convolverRef.current = convolver;
      reverbGainRef.current = reverb;
    }

    return true;
  }, []);

  const refreshMix = useCallback(() => {
    const context = audioContextRef.current;
    const master = masterGainRef.current;
    const music = musicGainRef.current;
    const effects = effectsGainRef.current;
    const reverb = reverbGainRef.current;

    if (!context || !master || !music || !effects || !reverb) {
      return;
    }

    const shouldSilence = !settings.enabled || settings.muted;
    const reducedFactor = settings.reducedSensoryMode ? 0.6 : 1;

    master.gain.setTargetAtTime(shouldSilence ? 0 : 1, context.currentTime, 0.18);
    music.gain.setTargetAtTime(shouldSilence ? 0 : settings.musicVolume * reducedFactor, context.currentTime, 0.26);
    effects.gain.setTargetAtTime(shouldSilence ? 0 : settings.effectsVolume * reducedFactor, context.currentTime, 0.2);
    reverb.gain.setTargetAtTime(shouldSilence ? 0 : 0.18 * reducedFactor, context.currentTime, 0.3);
  }, [settings.enabled, settings.effectsVolume, settings.musicVolume, settings.muted, settings.reducedSensoryMode]);

  const ensureAudioRuntime = useCallback(() => {
    if (!settings.enabled || settings.muted) {
      return false;
    }
    const graphReady = ensureGraph();
    if (!graphReady) {
      return false;
    }

    const context = audioContextRef.current;
    if (!context) {
      return false;
    }

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }

    if (!isAudioReady) {
      setIsAudioReady(true);
    }
    return true;
  }, [ensureGraph, isAudioReady, settings.enabled, settings.muted]);

  const startAmbient = useCallback(() => {
    const context = audioContextRef.current;
    const musicGain = musicGainRef.current;
    if (!context || !musicGain || ambientRef.current || !settings.enabled || settings.muted) {
      return;
    }

    const voiceBus = context.createGain();
    const voiceFilter = context.createBiquadFilter();
    const droneA = context.createOscillator();
    const droneB = context.createOscillator();
    const droneC = context.createOscillator();
    const droneGainA = context.createGain();
    const droneGainB = context.createGain();
    const droneGainC = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();

    const now = context.currentTime;
    const reducedFactor = settings.reducedSensoryMode ? 0.65 : 1;
    const profileConfig = getAmbienceConfig(ambienceProfile, settings.reducedSensoryMode);
    const actionLike = ambienceProfile === "action" || ambienceProfile === "risk" || ambienceProfile === "emergency";
    const engineeringLike = ambienceProfile === "engineering" || ambienceProfile === "command";

    voiceBus.gain.setValueAtTime(0.0001, now);
    voiceBus.gain.exponentialRampToValueAtTime((actionLike ? 0.4 : 0.34) * reducedFactor, now + 2.4);

    voiceFilter.type = "lowpass";
    voiceFilter.frequency.setValueAtTime(
      settings.reducedSensoryMode ? profileConfig.filterFrequency * 0.66 : profileConfig.filterFrequency,
      now
    );
    voiceFilter.Q.value = actionLike ? 0.58 : 0.42;

    droneA.type = "sine";
    droneB.type = "triangle";
    droneC.type = "sine";

    droneA.frequency.setValueAtTime(profileConfig.root, now);
    droneB.frequency.setValueAtTime(profileConfig.accent, now);
    droneC.frequency.setValueAtTime(profileConfig.texture, now);
    droneB.detune.value = engineeringLike ? -7 : 0;
    droneC.detune.value = ambienceProfile === "research" ? 8 : 3;

    droneGainA.gain.value = (actionLike ? 0.24 : 0.21) * reducedFactor;
    droneGainB.gain.value = (engineeringLike ? 0.12 : 0.09) * reducedFactor;
    droneGainC.gain.value = (ambienceProfile === "research" ? 0.08 : 0.06) * reducedFactor;

    lfo.type = "sine";
    lfo.frequency.value = profileConfig.lfoRate;
    lfoGain.gain.value = settings.reducedSensoryMode ? 26 : actionLike ? 72 : 56;

    lfo.connect(lfoGain);
    lfoGain.connect(voiceFilter.frequency);

    droneA.connect(droneGainA);
    droneB.connect(droneGainB);
    droneC.connect(droneGainC);
    droneGainA.connect(voiceFilter);
    droneGainB.connect(voiceFilter);
    droneGainC.connect(voiceFilter);
    voiceFilter.connect(voiceBus);
    voiceBus.connect(musicGain);

    noise.buffer = createNoiseBuffer(context, 2.6);
    noise.loop = true;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(
      settings.reducedSensoryMode ? profileConfig.noiseFrequency * 0.72 : profileConfig.noiseFrequency,
      now
    );
    noiseFilter.Q.value = 0.3;
    noiseGain.gain.value = settings.reducedSensoryMode ? 0.004 : actionLike ? 0.013 : 0.009;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(voiceBus);

    droneA.start(now);
    droneB.start(now);
    droneC.start(now);
    lfo.start(now);
    noise.start(now);

    const playAmbientPulse = () => {
      const pulseStart = context.currentTime + 0.02;
      const base = profileConfig.root * 2.52;
      const interval = settings.reducedSensoryMode ? 1.42 : ambienceProfile === "research" ? 1.62 : 1.48;
      playTone(context, musicGain, {
        startAt: pulseStart,
        duration: settings.reducedSensoryMode ? 0.36 : 0.44,
        type: "sine",
        frequency: base,
        endFrequency: base * 0.94,
        gain: profileConfig.pulseGain * reducedFactor,
        filterFrequency: actionLike ? 1780 : 1520
      });
      playTone(context, musicGain, {
        startAt: pulseStart + 0.16,
        duration: settings.reducedSensoryMode ? 0.3 : 0.42,
        type: "triangle",
        frequency: base * interval,
        endFrequency: base * interval * 0.95,
        gain: profileConfig.pulseGain * 0.72 * reducedFactor,
        filterFrequency: actionLike ? 1960 : 1660
      });
      playNoiseSweep(context, musicGain, {
        startAt: pulseStart + 0.03,
        duration: settings.reducedSensoryMode ? 0.16 : 0.24,
        gain: actionLike ? 0.0074 * reducedFactor : 0.0056 * reducedFactor,
        filterStart: profileConfig.noiseFrequency * 1.2,
        filterEnd: profileConfig.noiseFrequency * 0.72
      });

      if (ambienceProfile === "engineering" || ambienceProfile === "action" || ambienceProfile === "emergency") {
        playTone(context, musicGain, {
          startAt: pulseStart + 0.23,
          duration: 0.16,
          type: "sine",
          frequency: base * 1.92,
          endFrequency: base * 1.81,
          gain: 0.0094 * reducedFactor,
          filterFrequency: 1960
        });
      }
    };

    const initialTimeout = window.setTimeout(playAmbientPulse, 2200);
    const intervalId = window.setInterval(playAmbientPulse, profileConfig.pulseMs);

    const stop = () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(intervalId);

      const fadeAt = context.currentTime;
      voiceBus.gain.cancelScheduledValues(fadeAt);
      voiceBus.gain.setTargetAtTime(0.0001, fadeAt, 0.26);
      noiseGain.gain.cancelScheduledValues(fadeAt);
      noiseGain.gain.setTargetAtTime(0.0001, fadeAt, 0.2);

      try {
        droneA.stop(fadeAt + 0.45);
        droneB.stop(fadeAt + 0.45);
        droneC.stop(fadeAt + 0.45);
        lfo.stop(fadeAt + 0.45);
        noise.stop(fadeAt + 0.45);
      } catch {
        // Sources may already be stopped.
      }

      window.setTimeout(() => {
        droneA.disconnect();
        droneB.disconnect();
        droneC.disconnect();
        droneGainA.disconnect();
        droneGainB.disconnect();
        droneGainC.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        voiceFilter.disconnect();
        voiceBus.disconnect();
        noise.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
      }, 760);
    };

    ambientRef.current = { stop };
  }, [ambienceProfile, settings.enabled, settings.muted, settings.reducedSensoryMode]);

  const unlockAudio = useCallback(async () => {
    const graphReady = ensureGraph();
    if (!graphReady) {
      return;
    }

    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    setIsAudioReady(true);
  }, [ensureGraph]);

  const setAudioEnabled = useCallback(
    async (enabled: boolean) => {
      setSettings((prev) => {
        if (prev.enabled === enabled) {
          return prev;
        }
        const next = { ...prev, enabled };
        saveSettings(next);
        return next;
      });

      if (!enabled) {
        stopAmbient();
        const context = audioContextRef.current;
        if (context && context.state === "running") {
          window.setTimeout(() => {
            if (context.state === "running") {
              void context.suspend();
            }
          }, 280);
        }
        return;
      }

      await unlockAudio();
      refreshMix();
      startAmbient();
    },
    [refreshMix, startAmbient, stopAmbient, unlockAudio]
  );

  const toggleAudioEnabled = useCallback(async () => {
    await setAudioEnabled(!settings.enabled);
  }, [setAudioEnabled, settings.enabled]);

  const setAmbienceProfile = useCallback((profile: AmbienceProfile) => {
    setAmbienceProfileState((previous) => (previous === profile ? previous : profile));
  }, []);

  const playEffect = useCallback(
    (effect: EffectName) => {
      const canPlay = ensureAudioRuntime();
      if (!canPlay) {
        return;
      }

      const nowMs = performance.now();
      const lastAt = lastEffectAtRef.current[effect] ?? 0;
      if (effect === "hover" && nowMs - lastAt < 48) {
        return;
      }
      if (effect === "click" && nowMs - lastAt < 34) {
        return;
      }
      lastEffectAtRef.current[effect] = nowMs;

      const context = audioContextRef.current;
      const effectsGain = effectsGainRef.current;
      if (!context || !effectsGain || context.state === "closed") {
        return;
      }

      const now = context.currentTime;
      const scale = settings.reducedSensoryMode ? 0.68 : 1;

      switch (effect) {
        case "hover":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.07,
            type: "sine",
            frequency: 960,
            endFrequency: 860,
            gain: 0.016 * scale,
            filterFrequency: 2300
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now,
            duration: 0.06,
            gain: 0.0038 * scale,
            filterStart: 2500,
            filterEnd: 1700
          });
          break;
        case "click":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.11,
            type: "triangle",
            frequency: 380,
            endFrequency: 330,
            gain: 0.052 * scale,
            filterFrequency: 1700
          });
          playTone(context, effectsGain, {
            startAt: now + 0.02,
            duration: 0.09,
            type: "sine",
            frequency: 640,
            endFrequency: 550,
            gain: 0.024 * scale,
            filterFrequency: 2200
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now,
            duration: 0.09,
            gain: 0.006 * scale,
            filterStart: 2200,
            filterEnd: 980
          });
          break;
        case "confirm":
        case "success":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.12,
            type: "sine",
            frequency: 380,
            endFrequency: 480,
            gain: 0.052 * scale,
            filterFrequency: 2100
          });
          playTone(context, effectsGain, {
            startAt: now + 0.12,
            duration: 0.2,
            type: "sine",
            frequency: 480,
            endFrequency: 660,
            gain: 0.046 * scale,
            filterFrequency: 2400
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.01,
            duration: 0.09,
            gain: 0.0034 * scale,
            filterStart: 1800,
            filterEnd: 1200
          });
          break;
        case "transition":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.16,
            type: "triangle",
            frequency: 280,
            endFrequency: 460,
            gain: 0.05 * scale,
            filterFrequency: 1750
          });
          playTone(context, effectsGain, {
            startAt: now + 0.06,
            duration: 0.24,
            type: "sine",
            frequency: 430,
            endFrequency: 560,
            gain: 0.038 * scale,
            filterFrequency: 2150
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now,
            duration: 0.22,
            gain: 0.0084 * scale,
            filterStart: 1560,
            filterEnd: 520
          });
          break;
        case "intro":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.24,
            type: "triangle",
            frequency: 196,
            endFrequency: 264,
            gain: 0.054 * scale,
            filterFrequency: 1500
          });
          playTone(context, effectsGain, {
            startAt: now + 0.15,
            duration: 0.44,
            type: "sine",
            frequency: 264,
            endFrequency: 428,
            gain: 0.046 * scale,
            filterFrequency: 2300
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.03,
            duration: 0.3,
            gain: 0.006 * scale,
            filterStart: 1700,
            filterEnd: 680
          });
          break;
        case "tutorial":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.08,
            type: "sine",
            frequency: 660,
            endFrequency: 720,
            gain: 0.028 * scale,
            filterFrequency: 2400
          });
          playTone(context, effectsGain, {
            startAt: now + 0.085,
            duration: 0.14,
            type: "sine",
            frequency: 720,
            endFrequency: 810,
            gain: 0.026 * scale,
            filterFrequency: 2500
          });
          break;
        case "tactical":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.16,
            type: "triangle",
            frequency: 228,
            endFrequency: 308,
            gain: 0.07 * scale,
            filterFrequency: 1600
          });
          playTone(context, effectsGain, {
            startAt: now + 0.08,
            duration: 0.22,
            type: "sine",
            frequency: 360,
            endFrequency: 502,
            gain: 0.052 * scale,
            filterFrequency: 2220
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.015,
            duration: 0.12,
            gain: 0.0088 * scale,
            filterStart: 1880,
            filterEnd: 780
          });
          break;
        case "warning":
        case "unlock":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.12,
            type: "triangle",
            frequency: 280,
            endFrequency: 400,
            gain: 0.05 * scale,
            filterFrequency: 1900
          });
          playTone(context, effectsGain, {
            startAt: now + 0.14,
            duration: 0.22,
            type: "sine",
            frequency: 410,
            endFrequency: 580,
            gain: 0.06 * scale,
            filterFrequency: 2400
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.02,
            duration: 0.11,
            gain: 0.0065 * scale,
            filterStart: 1900,
            filterEnd: 980
          });
          break;
        case "alert":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.16,
            type: "triangle",
            frequency: 236,
            endFrequency: 214,
            gain: 0.064 * scale,
            filterFrequency: 1280
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.01,
            duration: 0.14,
            gain: 0.0075 * scale,
            filterStart: 1380,
            filterEnd: 840
          });
          playTone(context, effectsGain, {
            startAt: now + 0.2,
            duration: 0.16,
            type: "triangle",
            frequency: 236,
            endFrequency: 214,
            gain: 0.064 * scale,
            filterFrequency: 1280
          });
          break;
        case "emergency":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.14,
            type: "triangle",
            frequency: 196,
            endFrequency: 180,
            gain: 0.084 * scale,
            filterFrequency: 1160
          });
          playTone(context, effectsGain, {
            startAt: now + 0.16,
            duration: 0.14,
            type: "triangle",
            frequency: 196,
            endFrequency: 178,
            gain: 0.084 * scale,
            filterFrequency: 1160
          });
          playTone(context, effectsGain, {
            startAt: now + 0.33,
            duration: 0.26,
            type: "sine",
            frequency: 420,
            endFrequency: 340,
            gain: 0.054 * scale,
            filterFrequency: 1480
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now,
            duration: 0.36,
            gain: 0.012 * scale,
            filterStart: 1840,
            filterEnd: 620
          });
          break;
        case "incident":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.24,
            type: "triangle",
            frequency: 268,
            endFrequency: 224,
            gain: 0.072 * scale,
            filterFrequency: 1360
          });
          playTone(context, effectsGain, {
            startAt: now + 0.12,
            duration: 0.19,
            type: "sine",
            frequency: 512,
            endFrequency: 402,
            gain: 0.048 * scale,
            filterFrequency: 1720
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now + 0.03,
            duration: 0.21,
            gain: 0.009 * scale,
            filterStart: 1680,
            filterEnd: 720
          });
          break;
        case "error":
        default:
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.15,
            type: "triangle",
            frequency: 208,
            endFrequency: 170,
            gain: 0.072 * scale,
            filterFrequency: 1200
          });
          playTone(context, effectsGain, {
            startAt: now + 0.15,
            duration: 0.2,
            type: "sine",
            frequency: 170,
            endFrequency: 150,
            gain: 0.048 * scale,
            filterFrequency: 980
          });
          playNoiseSweep(context, effectsGain, {
            startAt: now,
            duration: 0.18,
            gain: 0.0084 * scale,
            filterStart: 1280,
            filterEnd: 440
          });
          break;
      }
    },
    [ensureAudioRuntime, settings.reducedSensoryMode]
  );

  const updateSettings = useCallback((next: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const merged: AudioSettings = {
        enabled: typeof next.enabled === "boolean" ? next.enabled : prev.enabled,
        musicVolume: typeof next.musicVolume === "number" ? clamp01(next.musicVolume) : prev.musicVolume,
        effectsVolume: typeof next.effectsVolume === "number" ? clamp01(next.effectsVolume) : prev.effectsVolume,
        muted: typeof next.muted === "boolean" ? next.muted : prev.muted,
        reducedSensoryMode:
          typeof next.reducedSensoryMode === "boolean" ? next.reducedSensoryMode : prev.reducedSensoryMode
      };

      if (
        merged.enabled === prev.enabled &&
        merged.musicVolume === prev.musicVolume &&
        merged.effectsVolume === prev.effectsVolume &&
        merged.muted === prev.muted &&
        merged.reducedSensoryMode === prev.reducedSensoryMode
      ) {
        return prev;
      }

      saveSettings(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    refreshMix();
  }, [refreshMix]);

  useEffect(() => {
    if (!settings.enabled || isAudioReady) {
      return;
    }

    const armFromGesture = () => {
      void unlockAudio();
    };

    window.addEventListener("pointerdown", armFromGesture, { once: true });
    window.addEventListener("keydown", armFromGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", armFromGesture);
      window.removeEventListener("keydown", armFromGesture);
    };
  }, [isAudioReady, settings.enabled, unlockAudio]);

  useEffect(() => {
    if (!settings.enabled || settings.muted) {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const context = audioContextRef.current;
      if (!context || context.state !== "suspended") {
        return;
      }
      void context
        .resume()
        .then(() => {
          refreshMix();
          stopAmbient();
          startAmbient();
        })
        .catch(() => undefined);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshMix, settings.enabled, settings.muted, startAmbient, stopAmbient]);

  useEffect(() => {
    if (!isAudioReady) {
      return;
    }

    if (!settings.enabled || settings.muted) {
      stopAmbient();
      return;
    }

    stopAmbient();
    startAmbient();
  }, [
    ambienceProfile,
    isAudioReady,
    settings.enabled,
    settings.muted,
    settings.reducedSensoryMode,
    startAmbient,
    stopAmbient
  ]);

  useEffect(() => {
    return () => {
      stopAmbient();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, [stopAmbient]);

  const value = useMemo<AudioContextValue>(
    () => ({
      settings,
      isAudioReady,
      isAudioEnabled: settings.enabled,
      ambienceProfile,
      unlockAudio,
      setAudioEnabled,
      toggleAudioEnabled,
      setAmbienceProfile,
      playEffect,
      updateSettings
    }),
    [
      ambienceProfile,
      settings,
      isAudioReady,
      unlockAudio,
      setAudioEnabled,
      toggleAudioEnabled,
      setAmbienceProfile,
      playEffect,
      updateSettings
    ]
  );

  return <AudioControllerContext.Provider value={value}>{children}</AudioControllerContext.Provider>;
}

export function useAudio() {
  const context = useContext(AudioControllerContext);
  if (!context) {
    throw new Error("useAudio must be used inside AudioProvider");
  }
  return context;
}
