import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";

interface UiPreferences {
  reducedSensoryMode: boolean;
  compactDensity: boolean;
  minimalNarrativeMode: boolean;
}

interface UiContextValue extends UiPreferences {
  setUiPreferences: (next: Pick<UiPreferences, "reducedSensoryMode" | "compactDensity">) => void;
  setMinimalNarrativeMode: (next: boolean) => void;
}

const MINIMAL_NARRATIVE_STORAGE_KEY = "orbital-directive-minimal-narrative";

const UiContext = createContext<UiContextValue | null>(null);

function resolveInitialMinimalNarrativeMode(): boolean {
  try {
    return localStorage.getItem(MINIMAL_NARRATIVE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function UiProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<UiPreferences>(() => ({
    reducedSensoryMode: false,
    compactDensity: false,
    minimalNarrativeMode: resolveInitialMinimalNarrativeMode()
  }));

  const setUiPreferences = useCallback((next: Pick<UiPreferences, "reducedSensoryMode" | "compactDensity">) => {
    setState((previous) => {
      if (previous.reducedSensoryMode === next.reducedSensoryMode && previous.compactDensity === next.compactDensity) {
        return previous;
      }
      return {
        ...previous,
        reducedSensoryMode: next.reducedSensoryMode,
        compactDensity: next.compactDensity
      };
    });
  }, []);

  const setMinimalNarrativeMode = useCallback((next: boolean) => {
    setState((previous) => {
      if (previous.minimalNarrativeMode === next) {
        return previous;
      }
      try {
        localStorage.setItem(MINIMAL_NARRATIVE_STORAGE_KEY, String(next));
      } catch {
        // localStorage is best-effort; UI should still update.
      }
      return {
        ...previous,
        minimalNarrativeMode: next
      };
    });
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      ...state,
      setUiPreferences,
      setMinimalNarrativeMode
    }),
    [state, setUiPreferences, setMinimalNarrativeMode]
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiContext);
  if (!context) {
    throw new Error("useUiPreferences must be used inside UiProvider");
  }
  return context;
}
