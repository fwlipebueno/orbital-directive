import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

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
  stops: Set<() => void>;
  progressionIndex: number;
};

type EffectConfig = {
  startFrequency: number;
  endFrequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  harmonic?: number;
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

function readStoredSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultSettings.enabled,
      musicVolume: typeof parsed.musicVolume === "number" ? parsed.musicVolume : defaultSettings.musicVolume,
      effectsVolume: typeof parsed.effectsVolume === "number" ? parsed.effectsVolume : defaultSettings.effectsVolume,
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

function getEffectConfig(effect: EffectName): EffectConfig {
  switch (effect) {
    case "hover":
      return { startFrequency: 760, endFrequency: 690, duration: 0.08, type: "sine", gain: 0.06 };
    case "click":
      return { startFrequency: 510, endFrequency: 430, duration: 0.1, type: "sine", gain: 0.08, harmonic: 680 };
    case "alert":
      return { startFrequency: 230, endFrequency: 200, duration: 0.18, type: "triangle", gain: 0.09, harmonic: 280 };
    case "success":
      return { startFrequency: 360, endFrequency: 460, duration: 0.18, type: "sine", gain: 0.1, harmonic: 580 };
    case "error":
      return { startFrequency: 220, endFrequency: 170, duration: 0.17, type: "triangle", gain: 0.11 };
    case "unlock":
      return { startFrequency: 280, endFrequency: 420, duration: 0.2, type: "sine", gain: 0.1, harmonic: 560 };
    case "incident":
      return { startFrequency: 280, endFrequency: 240, duration: 0.22, type: "triangle", gain: 0.09, harmonic: 350 };
    default:
      return { startFrequency: 300, endFrequency: 300, duration: 0.1, type: "sine", gain: 0.08 };
  }
}

function createPadVoice(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  frequency: number,
  gainScale: number,
  reducedSensoryMode: boolean
): () => void {
  const voiceGain = context.createGain();
  const filter = context.createBiquadFilter();
  const oscA = context.createOscillator();
  const oscB = context.createOscillator();

  oscA.type = "sine";
  oscB.type = "triangle";

  oscA.frequency.setValueAtTime(frequency, startAt);
  oscB.frequency.setValueAtTime(frequency * 2, startAt);
  oscB.detune.setValueAtTime(4.5, startAt);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(reducedSensoryMode ? 560 : 980, startAt);
  filter.Q.value = 0.22;

  const attack = reducedSensoryMode ? 1.4 : 2.2;
  const sustain = reducedSensoryMode ? 0.035 : 0.052;
  const release = reducedSensoryMode ? 1.8 : 2.6;
  const endAt = startAt + attack + 3.2 + release;

  voiceGain.gain.setValueAtTime(0.0001, startAt);
  voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.00012, sustain * gainScale), startAt + attack);
  voiceGain.gain.setValueAtTime(Math.max(0.00012, sustain * gainScale), startAt + attack + 3.2);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(voiceGain);
  voiceGain.connect(destination);

  oscA.start(startAt);
  oscB.start(startAt);
  oscA.stop(endAt + 0.05);
  oscB.stop(endAt + 0.05);

  const stop = () => {
    const now = context.currentTime;
    voiceGain.gain.cancelScheduledValues(now);
    voiceGain.gain.setTargetAtTime(0.0001, now, 0.12);
    try {
      oscA.stop(now + 0.3);
      oscB.stop(now + 0.3);
    } catch {
      // Oscillator may already be stopped.
    }
  };

  const cleanup = () => {
    oscA.disconnect();
    oscB.disconnect();
    filter.disconnect();
    voiceGain.disconnect();
  };

  oscA.onended = cleanup;

  return stop;
}

export function AudioProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AudioSettings>(readStoredSettings);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const effectsGainRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<AmbientEngine | null>(null);

  const stopAmbient = useCallback(() => {
    const ambient = ambientRef.current;
    if (!ambient) {
      return;
    }

    if (ambient.intervalId !== null) {
      window.clearInterval(ambient.intervalId);
    }

    for (const stop of ambient.stops) {
      stop();
    }

    ambient.stops.clear();
    ambient.intervalId = null;
    ambientRef.current = null;
  }, []);

  const ensureGraph = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const context = audioContextRef.current;
    if (!masterGainRef.current) {
      const master = context.createGain();
      const music = context.createGain();
      const effects = context.createGain();
      const compressor = context.createDynamicsCompressor();

      compressor.threshold.value = -26;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.018;
      compressor.release.value = 0.24;

      master.gain.value = 0;
      music.gain.value = 0;
      effects.gain.value = 0;

      music.connect(master);
      effects.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);

      masterGainRef.current = master;
      musicGainRef.current = music;
      effectsGainRef.current = effects;
    }
  }, []);

  const refreshVolume = useCallback(() => {
    const context = audioContextRef.current;
    const master = masterGainRef.current;
    const music = musicGainRef.current;
    const effects = effectsGainRef.current;

    if (!context || !master || !music || !effects) {
      return;
    }

    const shouldSilence = !settings.enabled || settings.muted;
    const reducedFactor = settings.reducedSensoryMode ? 0.35 : 1;

    master.gain.setTargetAtTime(shouldSilence ? 0 : 1, context.currentTime, 0.18);
    music.gain.setTargetAtTime(shouldSilence ? 0 : settings.musicVolume * reducedFactor, context.currentTime, 0.24);
    effects.gain.setTargetAtTime(shouldSilence ? 0 : settings.effectsVolume * reducedFactor, context.currentTime, 0.2);
  }, [settings.enabled, settings.effectsVolume, settings.musicVolume, settings.muted, settings.reducedSensoryMode]);

  const startAmbient = useCallback(() => {
    const context = audioContextRef.current;
    const musicGain = musicGainRef.current;

    if (!context || !musicGain || ambientRef.current || !settings.enabled || settings.muted) {
      return;
    }

    const progression = [98, 110, 123.47, 92.5, 103.83] as const;
    const engine: AmbientEngine = {
      intervalId: null,
      stops: new Set<() => void>(),
      progressionIndex: 0
    };

    const playStep = () => {
      const maybeRoot = progression[engine.progressionIndex % progression.length];
      if (typeof maybeRoot !== "number") {
        return;
      }
      const root = maybeRoot;
      const now = context.currentTime + 0.04;
      const triad = [root, root * 1.25, root * 1.5];

      for (const [index, note] of triad.entries()) {
        const stop = createPadVoice(context, musicGain, now + index * 0.22, note, 1 - index * 0.18, settings.reducedSensoryMode);
        engine.stops.add(stop);
        window.setTimeout(() => {
          engine.stops.delete(stop);
        }, 7600);
      }

      engine.progressionIndex += 1;
    };

    playStep();
    engine.intervalId = window.setInterval(playStep, settings.reducedSensoryMode ? 9200 : 7600);

    ambientRef.current = engine;
  }, [settings.enabled, settings.muted, settings.reducedSensoryMode]);

  const unlockAudio = useCallback(async () => {
    ensureGraph();
    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    setIsAudioReady(true);
    setSettings((prev) => {
      if (prev.enabled) {
        return prev;
      }
      const next = { ...prev, enabled: true };
      saveSettings(next);
      return next;
    });
  }, [ensureGraph]);

  const setAudioEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        stopAmbient();
        setSettings((prev) => {
          if (!prev.enabled) {
            return prev;
          }
          const next = { ...prev, enabled: false };
          saveSettings(next);
          return next;
        });
        return;
      }

      try {
        await unlockAudio();
      } catch {
        setSettings((prev) => {
          const next = { ...prev, enabled: true };
          saveSettings(next);
          return next;
        });
      }
    },
    [stopAmbient, unlockAudio]
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

      const config = getEffectConfig(effect);
      const now = context.currentTime;
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const osc = context.createOscillator();

      const scale = settings.reducedSensoryMode ? 0.55 : 1;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, config.gain * scale), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(settings.reducedSensoryMode ? 1200 : 2200, now);

      osc.type = config.type;
      osc.frequency.setValueAtTime(config.startFrequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, config.endFrequency), now + config.duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(effectsGain);
      osc.start(now);
      osc.stop(now + config.duration + 0.03);

      if (config.harmonic) {
        const harmonic = context.createOscillator();
        harmonic.type = "sine";
        harmonic.frequency.setValueAtTime(config.harmonic, now + 0.01);
        harmonic.connect(filter);
        harmonic.start(now + 0.01);
        harmonic.stop(now + config.duration);
        harmonic.onended = () => harmonic.disconnect();
      }

      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    },
    [settings.enabled, settings.muted, settings.reducedSensoryMode]
  );

  const updateSettings = useCallback((next: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
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
    refreshVolume();
  }, [refreshVolume]);

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
