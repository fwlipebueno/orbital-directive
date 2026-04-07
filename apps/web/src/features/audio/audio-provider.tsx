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

type EffectName = "hover" | "click" | "alert" | "success" | "error" | "unlock" | "incident";

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
  unlockAudio: () => Promise<void>;
  setAudioEnabled: (enabled: boolean) => Promise<void>;
  toggleAudioEnabled: () => Promise<void>;
  playEffect: (effect: EffectName) => void;
  updateSettings: (next: Partial<AudioSettings>) => void;
}

type AmbientEngine = {
  intervalId: number | null;
  stop: () => void;
};

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

export function AudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AudioSettings>(readStoredSettings);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const effectsGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<AmbientEngine | null>(null);

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

    voiceBus.gain.setValueAtTime(0.0001, now);
    voiceBus.gain.exponentialRampToValueAtTime(0.34 * reducedFactor, now + 2.4);

    voiceFilter.type = "lowpass";
    voiceFilter.frequency.setValueAtTime(settings.reducedSensoryMode ? 560 : 900, now);
    voiceFilter.Q.value = 0.45;

    droneA.type = "sine";
    droneB.type = "triangle";
    droneC.type = "sine";

    droneA.frequency.setValueAtTime(74, now);
    droneB.frequency.setValueAtTime(111, now);
    droneC.frequency.setValueAtTime(148, now);

    droneGainA.gain.value = 0.22 * reducedFactor;
    droneGainB.gain.value = 0.08 * reducedFactor;
    droneGainC.gain.value = 0.06 * reducedFactor;

    lfo.type = "sine";
    lfo.frequency.value = settings.reducedSensoryMode ? 0.026 : 0.045;
    lfoGain.gain.value = settings.reducedSensoryMode ? 34 : 58;

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
    noiseFilter.frequency.setValueAtTime(settings.reducedSensoryMode ? 420 : 640, now);
    noiseFilter.Q.value = 0.3;
    noiseGain.gain.value = settings.reducedSensoryMode ? 0.005 : 0.01;
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
      const base = 196;
      const interval = settings.reducedSensoryMode ? 1.498 : 1.333;
      playTone(context, musicGain, {
        startAt: pulseStart,
        duration: settings.reducedSensoryMode ? 0.4 : 0.52,
        type: "sine",
        frequency: base,
        endFrequency: base * 0.94,
        gain: 0.012 * reducedFactor,
        filterFrequency: 1400
      });
      playTone(context, musicGain, {
        startAt: pulseStart + 0.18,
        duration: settings.reducedSensoryMode ? 0.32 : 0.46,
        type: "triangle",
        frequency: base * interval,
        endFrequency: base * interval * 0.95,
        gain: 0.01 * reducedFactor,
        filterFrequency: 1600
      });
    };

    const initialTimeout = window.setTimeout(playAmbientPulse, 2400);
    const intervalId = window.setInterval(playAmbientPulse, settings.reducedSensoryMode ? 18000 : 12400);

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

    ambientRef.current = {
      intervalId,
      stop
    };
  }, [settings.enabled, settings.muted, settings.reducedSensoryMode]);

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

  const playEffect = useCallback(
    (effect: EffectName) => {
      const context = audioContextRef.current;
      const effectsGain = effectsGainRef.current;
      if (!context || !effectsGain || !settings.enabled || settings.muted) {
        return;
      }

      const now = context.currentTime;
      const scale = settings.reducedSensoryMode ? 0.68 : 1;

      switch (effect) {
        case "hover":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.08,
            type: "sine",
            frequency: 820,
            endFrequency: 760,
            gain: 0.028 * scale,
            filterFrequency: 1900
          });
          break;
        case "click":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.11,
            type: "triangle",
            frequency: 460,
            endFrequency: 396,
            gain: 0.055 * scale,
            filterFrequency: 1800
          });
          playTone(context, effectsGain, {
            startAt: now + 0.02,
            duration: 0.08,
            type: "sine",
            frequency: 710,
            endFrequency: 640,
            gain: 0.025 * scale,
            filterFrequency: 2100
          });
          break;
        case "success":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.13,
            type: "sine",
            frequency: 380,
            endFrequency: 480,
            gain: 0.058 * scale,
            filterFrequency: 2100
          });
          playTone(context, effectsGain, {
            startAt: now + 0.12,
            duration: 0.18,
            type: "sine",
            frequency: 480,
            endFrequency: 620,
            gain: 0.052 * scale,
            filterFrequency: 2300
          });
          break;
        case "unlock":
          playTone(context, effectsGain, {
            startAt: now,
            duration: 0.12,
            type: "triangle",
            frequency: 300,
            endFrequency: 410,
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
          break;
      }
    },
    [settings.enabled, settings.muted, settings.reducedSensoryMode]
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
    if (!isAudioReady) {
      return;
    }

    if (!settings.enabled || settings.muted) {
      stopAmbient();
      return;
    }

    startAmbient();
  }, [isAudioReady, settings.enabled, settings.muted, settings.reducedSensoryMode, startAmbient, stopAmbient]);

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
      unlockAudio,
      setAudioEnabled,
      toggleAudioEnabled,
      playEffect,
      updateSettings
    }),
    [settings, isAudioReady, unlockAudio, setAudioEnabled, toggleAudioEnabled, playEffect, updateSettings]
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
