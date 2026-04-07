import type { StationState } from "@orbital/shared";
import { cn } from "../lib/cn";
import { getSceneDefinition, getSeverityOverlay, type SceneId } from "../lib/space-scenes";

interface SpaceSceneBackdropProps {
  sceneId: SceneId;
  severity?: StationState["runSummary"]["severity"];
  className?: string;
  showLabel?: boolean;
}

export function SpaceSceneBackdrop({ sceneId, severity = "normal", className, showLabel = false }: SpaceSceneBackdropProps) {
  const scene = getSceneDefinition(sceneId);

  return (
    <div className={cn("space-scene-backdrop pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0 scene-image-layer"
        style={{
          backgroundImage: `${scene.overlay}, url(${scene.imageUrl})`,
          backgroundPosition: scene.focal,
          backgroundSize: "cover",
          filter: "contrast(1.14) saturate(1.24) brightness(1.08)"
        }}
      />
      <div className="absolute inset-0 opacity-55" style={{ backgroundImage: getSeverityOverlay(severity) }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(255,255,255,0.22)_1px,transparent_1.7px),radial-gradient(circle_at_68%_22%,rgba(255,255,255,0.2)_1px,transparent_1.8px),radial-gradient(circle_at_82%_58%,rgba(255,255,255,0.15)_1px,transparent_2px)] opacity-38" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,7,15,0.05),rgba(2,7,15,0.62))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_110%,rgba(102,174,255,0.38),transparent_52%)] opacity-70" />
      <div className="scene-scanline absolute inset-x-0 top-[28%] h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <div className="scene-scanline absolute inset-x-0 top-[58%] h-px bg-gradient-to-r from-transparent via-accent-sky/30 to-transparent" />

      {showLabel ? (
        <div className="absolute left-4 top-4 rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-soft">
          {scene.title}
        </div>
      ) : null}
    </div>
  );
}
