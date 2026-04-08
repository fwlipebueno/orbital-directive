import type { StationState } from "@orbital/shared";
import {
  AlertTriangle,
  BookText,
  Bot,
  Gauge,
  HelpCircle,
  Languages,
  LogOut,
  Music2,
  NotebookText,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wrench
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useUiPreferences } from "../app/ui-context";
import { useAudio, type AmbienceProfile } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatRelativeDate } from "../lib/format";
import { getSceneDefinition, resolveSceneId, type SceneId } from "../lib/space-scenes";
import { MissionIntroSequence } from "./mission-intro-sequence";
import { SeverityBadge } from "./severity-badge";
import { SpaceSceneBackdrop } from "./space-scene-backdrop";
import { TutorialModal } from "./tutorial-modal";

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof Gauge;
};

const navItems: NavItem[] = [
  { to: "/dashboard", labelKey: "shell.nav.dashboard", icon: Gauge },
  { to: "/expedition", labelKey: "shell.nav.expedition", icon: Rocket },
  { to: "/modules", labelKey: "shell.nav.modules", icon: Wrench },
  { to: "/research", labelKey: "shell.nav.research", icon: Sparkles },
  { to: "/incidents", labelKey: "shell.nav.incidents", icon: AlertTriangle },
  { to: "/logs", labelKey: "shell.nav.logs", icon: NotebookText },
  { to: "/run-summary", labelKey: "shell.nav.runSummary", icon: BookText },
  { to: "/settings", labelKey: "shell.nav.settings", icon: Settings }
];

const tutorialSeenKey = "orbital-directive-tutorial-seen";
const introPlayedSessionKey = "orbital-directive-cinematic-intro-played";
const introRequestedSessionKey = "orbital-directive-cinematic-intro-requested";

interface AppShellProps {
  station: StationState;
  userName: string;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ station, userName, onLogout, children }: AppShellProps) {
  const audio = useAudio();
  const location = useLocation();
  const sceneId = resolveSceneId(location.pathname);
  const scene = getSceneDefinition(sceneId);
  const { locale, setLocale, t } = useI18n();
  const { minimalNarrativeMode, setMinimalNarrativeMode, reducedSensoryMode } = useUiPreferences();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [routeTransitioning, setRouteTransitioning] = useState(false);
  const [routeContentHidden, setRouteContentHidden] = useState(false);
  const [transitionLabel, setTransitionLabel] = useState<{ from: SceneId; to: SceneId } | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [introExiting, setIntroExiting] = useState(false);
  const [introShellReveal, setIntroShellReveal] = useState(false);
  const [introPhase, setIntroPhase] = useState(0);
  const [introProgress, setIntroProgress] = useState(0);
  const [introTick, setIntroTick] = useState(0);

  const initialPathRef = useRef(location.pathname);
  const previousSceneRef = useRef<SceneId>(sceneId);
  const previousPhaseRef = useRef(0);
  const introExitTimeoutRef = useRef<number | null>(null);
  const sceneContext = useMemo(() => t(`scene.context.${sceneId}`), [sceneId, t]);

  const audioActionLabel = audio.isAudioEnabled
    ? audio.isAudioReady
      ? t("common.audioArmed")
      : t("common.audioPending")
    : t("common.enableAudio");

  const clearIntroExitTimeout = useCallback(() => {
    if (introExitTimeoutRef.current) {
      window.clearTimeout(introExitTimeoutRef.current);
      introExitTimeoutRef.current = null;
    }
  }, []);

  const beginIntroHandoff = useCallback(
    (durationMs: number) => {
      setIntroShellReveal(true);
      setIntroExiting(true);
      clearIntroExitTimeout();
      introExitTimeoutRef.current = window.setTimeout(() => {
        setIntroOpen(false);
        setIntroExiting(false);
      }, durationMs);
    },
    [clearIntroExitTimeout]
  );

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(tutorialSeenKey) === "true";
    if (!hasSeenTutorial) {
      setTutorialOpen(true);
      localStorage.setItem(tutorialSeenKey, "true");
    }
  }, []);

  useEffect(() => {
    const severity = station.runSummary.severity;
    const nextProfile: AmbienceProfile = (() => {
      if (severity === "crisis") {
        if (sceneId === "debrief" || sceneId === "logs") {
          return "risk";
        }
        return "emergency";
      }

      if (sceneId === "expedition") {
        return severity === "alert" || severity === "attention" ? "action" : "command";
      }

      if (sceneId === "incidents") {
        return "risk";
      }
      if (sceneId === "modules") {
        return "engineering";
      }
      if (sceneId === "research") {
        return "research";
      }
      if (sceneId === "logs" || sceneId === "debrief") {
        return "debrief";
      }
      if (sceneId === "dashboard") {
        if (severity === "alert" || severity === "attention") {
          return "risk";
        }
        return "command";
      }
      if (severity === "alert" || severity === "attention") {
        return "risk";
      }
      return "calm";
    })();
    audio.setAmbienceProfile(nextProfile);
  }, [audio, sceneId, station.runSummary.severity]);

  useLayoutEffect(() => {
    if (reducedSensoryMode) {
      setRouteTransitioning(false);
      setRouteContentHidden(false);
      setTransitionLabel(null);
      previousSceneRef.current = sceneId;
      return;
    }

    const isInitialRender = initialPathRef.current === location.pathname;
    if (isInitialRender) {
      initialPathRef.current = "";
      previousSceneRef.current = sceneId;
      return;
    }

    setRouteTransitioning(true);
    setRouteContentHidden(true);
    setTransitionLabel({ from: previousSceneRef.current, to: sceneId });
    audio.playEffect("transition");
    const holdTimeout = window.setTimeout(() => {
      setRouteContentHidden(false);
    }, 520);
    const timeoutId = window.setTimeout(() => {
      setRouteTransitioning(false);
      setTransitionLabel(null);
    }, 1080);
    previousSceneRef.current = sceneId;
    return () => {
      window.clearTimeout(holdTimeout);
      window.clearTimeout(timeoutId);
    };
  }, [audio, location.pathname, reducedSensoryMode, sceneId]);

  useLayoutEffect(() => {
    if (reducedSensoryMode || !location.pathname.startsWith("/dashboard")) {
      return;
    }

    const introRequested = sessionStorage.getItem(introRequestedSessionKey) === "true";
    const introPlayed = sessionStorage.getItem(introPlayedSessionKey) === "true";
    if (!introRequested && introPlayed) {
      return;
    }

    setIntroOpen(true);
    setIntroExiting(false);
    setIntroShellReveal(false);
    setIntroPhase(0);
    setIntroProgress(0);
    setIntroTick(Date.now());
    previousPhaseRef.current = 0;
    sessionStorage.setItem(introPlayedSessionKey, "true");
    sessionStorage.removeItem(introRequestedSessionKey);
  }, [location.pathname, reducedSensoryMode]);

  useEffect(() => {
    if (!introOpen || introExiting) {
      return;
    }

    const startedAt = Date.now();
    const totalMs = 8200;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const clamped = Math.max(0, Math.min(1, elapsed / totalMs));
      const phase = Math.min(3, Math.floor((elapsed / totalMs) * 4));
      setIntroProgress(clamped);
      setIntroPhase(phase);

      if (phase !== previousPhaseRef.current) {
        previousPhaseRef.current = phase;
        if (phase === 1 || phase === 2) {
          audio.playEffect("transition");
        }
        if (phase === 3) {
          audio.playEffect("confirm");
        }
      }

      if (clamped >= 0.82) {
        setIntroShellReveal(true);
      }

      if (elapsed >= totalMs) {
        window.clearInterval(tick);
        setIntroProgress(1);
        setIntroPhase(3);
        beginIntroHandoff(760);
      }
    }, 88);

    audio.playEffect("intro");
    return () => window.clearInterval(tick);
  }, [audio, beginIntroHandoff, introExiting, introOpen, introTick]);

  useEffect(() => {
    return () => {
      clearIntroExitTimeout();
    };
  }, [clearIntroExitTimeout]);

  return (
    <div className="command-grid relative min-h-screen bg-bg-deep text-ink-strong">
      <SpaceSceneBackdrop sceneId={sceneId} severity={station.runSummary.severity} />

      <div
        className={cn(
          "orbital-shell",
          introOpen && !introShellReveal && "intro-shell-hidden",
          introOpen && introShellReveal && "intro-shell-revealing"
        )}
      >
        <div className="orbital-layout" data-nav-collapsed={navCollapsed ? "true" : "false"}>
          <aside className={cn("tactical-dock glass-panel lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)]", navCollapsed ? "px-2" : "")}>
            <header className={cn("mb-5 border-b border-white/15 pb-4", navCollapsed ? "px-1" : "")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                {!navCollapsed ? (
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ink-soft">{t("shell.dockEyebrow")}</p>
                ) : null}
                <button
                  type="button"
                  onMouseEnter={() => audio.playEffect("hover")}
                  onClick={() => {
                    audio.playEffect("click");
                    setNavCollapsed((previous) => !previous);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/25 text-ink-soft transition hover:border-accent-sky/40 hover:text-ink-strong"
                  aria-label={navCollapsed ? t("shell.expandNav") : t("shell.collapseNav")}
                  title={navCollapsed ? t("shell.expandNav") : t("shell.collapseNav")}
                >
                  {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>

              {!navCollapsed ? (
                <>
                  <h1 className="mt-3 font-display text-xl">{station.stationName}</h1>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t("common.commander")}: {userName}
                  </p>
                </>
              ) : null}

              <div className={cn("mt-4", navCollapsed ? "flex justify-center" : "")}>
                <SeverityBadge severity={station.runSummary.severity} />
              </div>
            </header>

            <nav className="grid gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onMouseEnter={() => audio.playEffect("hover")}
                    onClick={() => audio.playEffect("click")}
                    className={({ isActive }) =>
                      cn(
                        "nav-chip group flex items-center gap-2.5 px-3 py-2 text-sm",
                        navCollapsed && "justify-center px-2",
                        isActive
                          ? "border-accent-sky/56 bg-accent-sky/18 text-ink-strong shadow-[0_0_0_1px_rgba(122,208,255,0.24),0_12px_24px_rgba(5,15,30,0.36)]"
                          : "text-ink-normal hover:bg-white/[0.06]"
                      )
                    }
                    title={t(item.labelKey)}
                  >
                    <Icon className="h-4 w-4" />
                    {!navCollapsed ? <span>{t(item.labelKey)}</span> : null}
                  </NavLink>
                );
              })}
            </nav>

            <footer className="mt-6 border-t border-white/12 pt-4">
              <button
                type="button"
                onMouseEnter={() => audio.playEffect("hover")}
                onClick={() => {
                  audio.playEffect("click");
                  setHudOpen((previous) => !previous);
                }}
                className={cn(
                  "mb-2 flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                  hudOpen
                    ? "border-accent-sky/60 bg-accent-sky/14 text-ink-strong"
                    : "border-white/20 bg-black/25 text-ink-normal hover:border-accent-sky/45"
                )}
                title={t("shell.controlsButton")}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {!navCollapsed ? t("shell.controlsButton") : null}
              </button>

              <button
                type="button"
                onMouseEnter={() => audio.playEffect("hover")}
                onClick={() => {
                  audio.playEffect("click");
                  void onLogout();
                }}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-full border border-accent-red/55 px-3 py-2 text-sm text-accent-red transition hover:bg-accent-red/10",
                  navCollapsed ? "px-2" : ""
                )}
                title={t("common.logout")}
              >
                <LogOut className="h-4 w-4" />
                {!navCollapsed ? t("common.logout") : null}
              </button>
            </footer>
          </aside>

          <section className="grid min-h-[80vh] grid-rows-[auto_1fr] gap-3">
            <header className="hud-header flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-soft">{t("shell.header.eyebrow")}</p>
                <h2 className="mt-1 flex items-center gap-2 font-display text-2xl text-ink-strong">
                  <Bot className="h-5 w-5 text-accent-sky" />
                  {scene.title}
                </h2>
                {minimalNarrativeMode ? null : <p className="mt-1 max-w-3xl text-xs text-ink-soft">{sceneContext}</p>}
              </div>

              <div className="grid gap-1.5">
                <p className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  {scene.credit.label}
                </p>
                <p className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  {t("shell.header.lastSync")} {formatRelativeDate(station.lastProcessedAt)}
                </p>
              </div>
            </header>

            <div className="route-stage">
              {routeTransitioning ? (
                <div className="route-cinematic-overlay">
                  {transitionLabel ? (
                    <div className="sector-transition-label">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-soft">{t("transition.eyebrow")}</p>
                      <p className="mt-1 font-display text-lg text-ink-strong">
                        {t(`transition.scene.${transitionLabel.from}`)} {t("transition.to")} {t(`transition.scene.${transitionLabel.to}`)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <main key={location.pathname} className={cn("grid gap-4 pb-3", routeContentHidden && "route-content-hold")}>
                {children}
              </main>
            </div>
          </section>
        </div>
      </div>

      <aside
        className={cn(
          "hud-drawer fixed bottom-4 right-4 z-30 w-[min(94vw,340px)] rounded-[24px] border border-white/20 bg-[linear-gradient(180deg,rgba(7,15,27,0.95),rgba(4,9,17,0.97))] p-4 shadow-[0_26px_70px_rgba(2,6,14,0.75)] backdrop-blur-xl transition-all duration-300",
          hudOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
          introOpen && !introShellReveal && "intro-ui-hidden",
          introOpen && introShellReveal && "intro-ui-revealing"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{t("shell.controlsTitle")}</p>
          <button
            type="button"
            onClick={() => {
              audio.playEffect("click");
              setHudOpen(false);
            }}
            className="rounded-lg border border-white/20 px-2 py-1 text-xs text-ink-soft transition hover:border-accent-sky/45 hover:text-ink-strong"
          >
            {t("shell.controlsClose")}
          </button>
        </div>

        <div className="grid gap-2.5">
          <button
            type="button"
            onClick={() => {
              audio.playEffect("tutorial");
              setTutorialOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-2 text-sm text-ink-normal transition hover:bg-white/10"
          >
            <HelpCircle className="h-4 w-4" />
            {t("tutorial.button")}
          </button>

          <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-ink-soft">
            {t("shell.minimalMode")}
            <input
              type="checkbox"
              checked={minimalNarrativeMode}
              onChange={(event) => {
                setMinimalNarrativeMode(event.target.checked);
                audio.playEffect("click");
              }}
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-ink-soft">
            <Languages className="h-3.5 w-3.5 text-ink-normal" />
            {t("common.language")}
            <select
              value={locale}
              onChange={(event) => {
                setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en-US");
                audio.playEffect("click");
              }}
              className="ml-auto rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-ink-normal outline-none"
            >
              <option value="en-US">{t("common.enUS")}</option>
              <option value="pt-BR">{t("common.ptBR")}</option>
            </select>
          </label>

          <button
            type="button"
            onClick={async () => {
              const nextEnabled = !audio.isAudioEnabled;
              await audio.setAudioEnabled(nextEnabled);
              if (nextEnabled) {
                audio.playEffect("intro");
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-ink-soft/30 px-3 py-2 text-sm text-ink-normal transition hover:border-accent-sky/50 hover:text-ink-strong"
          >
            <Music2 className="h-4 w-4" />
            {audioActionLabel}
          </button>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => {
          audio.playEffect("tutorial");
          setTutorialOpen(true);
        }}
        className={cn(
          "fixed bottom-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/45 px-3 py-2 text-xs text-ink-normal shadow-[0_18px_44px_rgba(2,6,14,0.55)] backdrop-blur-md transition hover:border-accent-sky/45 hover:text-ink-strong",
          hudOpen ? "right-[356px] max-md:right-4" : "right-4",
          introOpen && !introShellReveal && "intro-ui-hidden",
          introOpen && introShellReveal && "intro-ui-revealing"
        )}
      >
        <HelpCircle className="h-4 w-4" />
        {t("tutorial.button")}
      </button>

      <MissionIntroSequence
        open={introOpen}
        exiting={introExiting}
        phase={introPhase}
        progress={introProgress}
        onSkip={() => {
          audio.playEffect("click");
          setIntroProgress(1);
          setIntroPhase(3);
          beginIntroHandoff(420);
        }}
      />

      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}
