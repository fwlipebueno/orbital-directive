import type { StationState } from "@orbital/shared";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import { useI18n } from "../i18n/i18n-provider";
import { getSceneDefinition } from "../lib/space-scenes";

type EarthViewportProps = {
  station: StationState;
  className?: string;
};

function riskTone(severity: StationState["runSummary"]["severity"]): string {
  switch (severity) {
    case "crisis":
      return "rgba(255,124,124,0.28)";
    case "alert":
      return "rgba(242,185,93,0.24)";
    case "attention":
      return "rgba(122,208,255,0.2)";
    default:
      return "rgba(68,201,179,0.18)";
  }
}

export function EarthViewport({ station, className }: EarthViewportProps) {
  const { t } = useI18n();
  const dashboardScene = getSceneDefinition("dashboard");
  const riskGlow = riskTone(station.runSummary.severity);

  return (
    <div className={cn("earth-viewport real-viewport relative overflow-hidden rounded-[22px] border border-white/15", className)}>
      <div
        className="absolute inset-0 scale-[1.05]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(2,7,14,0.08), rgba(2,7,14,0.62)), url(${dashboardScene.imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center 44%",
          filter: "contrast(1.2) saturate(1.3) brightness(1.15)"
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(255,255,255,0.25),transparent_34%),radial-gradient(circle_at_66%_82%,rgba(106,186,255,0.26),transparent_44%)]" />
      <div className="orbital-atmosphere absolute inset-0" />
      <div className="orbital-sunwash absolute inset-0" />
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 78% 24%, ${riskGlow}, transparent 36%)` }} />

      <div className="orbital-ring orbital-ring--a" />
      <div className="orbital-ring orbital-ring--b" />
      <div className="orbital-ring orbital-ring--c" />
      <div className="orbital-ring orbital-ring--d" />

      <div className="station-mark" />

      <div className="telemetry-overlay pointer-events-none absolute inset-0">
        <div className="absolute left-3 top-3 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          {t("dashboard.telemetry.solarExposure")} {formatNumber(station.missionTelemetry.solarExposure * 100, 1)}%
        </div>
        <div className="absolute right-3 top-3 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          {t("dashboard.telemetry.orbitalStability")} {formatNumber(station.missionTelemetry.orbitalStability, 1)}%
        </div>
        <div className="absolute left-3 bottom-3 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          {t("dashboard.telemetry.thermalLoad")} {formatNumber(station.missionTelemetry.thermalLoad, 1)}%
        </div>
        <div className="absolute right-3 bottom-3 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
          {t("dashboard.telemetry.hullPressure")} {formatNumber(station.missionTelemetry.hullPressure, 1)}%
        </div>
      </div>
    </div>
  );
}
