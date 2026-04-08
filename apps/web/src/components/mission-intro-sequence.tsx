import { SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSceneDefinition, type SceneId } from "../lib/space-scenes";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";

interface MissionIntroSequenceProps {
  open: boolean;
  exiting: boolean;
  phase: number;
  progress: number;
  onSkip: () => void;
}

const phaseScenes: SceneId[] = ["entry", "dashboard", "modules", "dashboard"];
const totalPhases = 4;

export function MissionIntroSequence({ open, exiting, phase, progress, onSkip }: MissionIntroSequenceProps) {
  const { t } = useI18n();
  const [assetsReady, setAssetsReady] = useState(false);
  const sceneSources = useMemo(() => phaseScenes.map((sceneId) => getSceneDefinition(sceneId).imageUrl), []);

  useEffect(() => {
    if (!open) {
      setAssetsReady(false);
      return;
    }

    let active = true;
    Promise.all(
      sceneSources.map(
        (source) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = source;
          })
      )
    ).then(() => {
      if (active) {
        setAssetsReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [open, sceneSources]);

  if (!open) {
    return null;
  }

  const currentPhase = Math.min(totalPhases, phase + 1);
  const progressPercent = Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <div className={cn("mission-intro fixed inset-0 z-[90]", exiting && "mission-intro--exiting")}>
      <div className="mission-intro-blackout absolute inset-0" />
      <div className="mission-intro-layer-stack absolute inset-0">
        {phaseScenes.map((sceneId, index) => {
          const scene = getSceneDefinition(sceneId);
          const isVisible = phase === index || phase - 1 === index;
          return (
            <div
              key={`${sceneId}-${index}`}
              className={cn(
                "mission-intro-image absolute inset-0",
                phase === index && "mission-intro-image--active",
                isVisible && "mission-intro-image--visible"
              )}
              style={{
                backgroundImage: `${scene.overlay}, url(${scene.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: scene.focal
              }}
            />
          );
        })}
      </div>

      {!assetsReady ? <div className="mission-intro-loader absolute inset-0" /> : null}
      <div className="mission-intro-vignette absolute inset-0" />
      <div className="mission-intro-grid absolute inset-0" />
      <div className="mission-intro-sweep absolute inset-0" />

      <div className="mission-intro-content absolute inset-x-0 bottom-[12vh] mx-auto w-[min(92vw,860px)] rounded-[24px] border border-white/20 bg-[linear-gradient(180deg,rgba(5,12,24,0.84),rgba(3,8,16,0.92))] p-5 shadow-[0_28px_74px_rgba(1,4,10,0.75)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-ink-soft">{t("intro.eyebrow")}</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">
            {currentPhase}/{totalPhases} | {progressPercent}%
          </p>
        </div>
        <h2 className="mt-2 font-display text-[1.8rem] leading-[1.1] text-ink-strong">{t(`intro.phase${currentPhase}.title`)}</h2>
        <p className="mt-2 text-sm text-ink-normal">{t(`intro.phase${currentPhase}.body`)}</p>

        <div className="mission-intro-phase-track mt-3">
          {Array.from({ length: totalPhases }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "mission-intro-phase-dot",
                index < currentPhase && "mission-intro-phase-dot--active",
                index === currentPhase - 1 && "mission-intro-phase-dot--current"
              )}
            />
          ))}
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full border border-white/16 bg-white/[0.06]">
          <div
            className="mission-intro-progress-bar h-full rounded-full bg-gradient-to-r from-accent-sky/82 via-accent-teal/82 to-accent-sky/82 transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-ink-soft">{t("intro.syncStatus")}</p>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/28 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.12em] text-ink-normal transition hover:border-accent-sky/55 hover:text-ink-strong"
      >
        <SkipForward className="h-3.5 w-3.5" />
        {t("intro.skip")}
      </button>
    </div>
  );
}
