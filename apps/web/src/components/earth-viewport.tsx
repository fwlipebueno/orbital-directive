import type { StationState } from "@orbital/shared";
import { Orbit, Radar, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import { getSceneDefinition } from "../lib/space-scenes";

type EarthViewportProps = {
  station: StationState;
  className?: string;
};

function riskTone(severity: StationState["runSummary"]["severity"]): string {
  switch (severity) {
    case "crisis":
      return "rgba(255,124,124,0.3)";
    case "alert":
      return "rgba(242,185,93,0.28)";
    case "attention":
      return "rgba(122,208,255,0.22)";
    default:
      return "rgba(68,201,179,0.2)";
  }
}

function missionStateLabel(severity: StationState["runSummary"]["severity"], t: (key: string) => string): string {
  switch (severity) {
    case "crisis":
      return t("dashboard.missionState.crisis");
    case "alert":
      return t("dashboard.missionState.alert");
    case "attention":
      return t("dashboard.missionState.attention");
    default:
      return t("dashboard.missionState.nominal");
  }
}

export function EarthViewport({ station, className }: EarthViewportProps) {
  const { t } = useI18n();
  const dashboardScene = getSceneDefinition("dashboard");
  const riskGlow = riskTone(station.runSummary.severity);

  return (
    <div className={cn("earth-viewport real-viewport relative overflow-hidden rounded-[26px] border border-white/20", className)}>
      <div
        className="absolute inset-0 scale-[1.09]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(2,7,14,0.05), rgba(2,7,14,0.64)), url(${dashboardScene.imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center 44%",
          filter: "contrast(1.28) saturate(1.42) brightness(1.18)"
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_12%,rgba(255,255,255,0.29),transparent_34%),radial-gradient(circle_at_66%_82%,rgba(106,186,255,0.33),transparent_44%)]" />
      <div className="orbital-cloud-sheen absolute inset-0" />
      <div className="orbital-atmosphere absolute inset-0" />
      <div className="orbital-sunwash absolute inset-0" />
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 78% 24%, ${riskGlow}, transparent 38%)` }} />

      <div className="orbital-ring orbital-ring--a" />
      <div className="orbital-ring orbital-ring--b" />
      <div className="orbital-ring orbital-ring--c" />
      <div className="orbital-ring orbital-ring--d" />

      <div className="station-mark" />

      <div className="absolute left-4 top-4 z-[2] rounded-full border border-white/24 bg-black/38 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-soft">
        {t("dashboard.theater.viewport")}
      </div>

      <div className="absolute right-4 top-4 z-[2] flex items-center gap-2 rounded-full border border-white/24 bg-black/38 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-soft">
        <Orbit className="h-3.5 w-3.5 text-accent-sky" />
        {t("dashboard.theater.altitude")} 412 km
      </div>

      <div className="telemetry-overlay pointer-events-none absolute inset-0">
        <div className="absolute left-4 bottom-4 right-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/22 bg-black/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.telemetry.solarExposure")}</p>
            <p className="mt-1 text-sm text-ink-strong">{formatNumber(station.missionTelemetry.solarExposure * 100, 1)}%</p>
          </div>
          <div className="rounded-xl border border-white/22 bg-black/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.telemetry.orbitalStability")}</p>
            <p className="mt-1 text-sm text-ink-strong">{formatNumber(station.missionTelemetry.orbitalStability, 1)}%</p>
          </div>
          <div className="rounded-xl border border-white/22 bg-black/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.telemetry.thermalLoad")}</p>
            <p className="mt-1 text-sm text-ink-strong">{formatNumber(station.missionTelemetry.thermalLoad, 1)}%</p>
          </div>
          <div className="rounded-xl border border-white/22 bg-black/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.telemetry.hullPressure")}</p>
            <p className="mt-1 text-sm text-ink-strong">{formatNumber(station.missionTelemetry.hullPressure, 1)}%</p>
          </div>
        </div>
      </div>

      <div className="absolute left-4 top-14 z-[2] rounded-xl border border-white/18 bg-black/35 px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.theater.status")}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-strong">
          <ShieldAlert className="h-4 w-4 text-accent-amber" />
          {missionStateLabel(station.runSummary.severity, t)}
        </p>
      </div>

      <div className="entry-scanner absolute inset-x-6 top-[34%] h-px bg-gradient-to-r from-transparent via-accent-sky/45 to-transparent opacity-70" />
      <div className="absolute right-4 top-[32%] rounded-full border border-white/20 bg-black/38 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <Radar className="h-3.5 w-3.5 text-accent-teal" />
          {t("dashboard.theater.radar")}
        </span>
      </div>
      <div className="absolute left-4 top-[32%] rounded-full border border-white/20 bg-black/38 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-accent-sky" />
          {t("dashboard.theater.tracking")}
        </span>
      </div>
    </div>
  );
}
