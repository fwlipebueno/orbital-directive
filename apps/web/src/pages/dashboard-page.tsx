import type { StationState } from "@orbital/shared";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Radar, ShieldAlert, Target } from "lucide-react";
import { useUiPreferences } from "../app/ui-context";
import { CommandDirectivePanel } from "../components/command-directive-panel";
import { EarthViewport } from "../components/earth-viewport";
import { ResourceStrip } from "../components/resource-strip";
import { useAudio } from "../features/audio/audio-provider";
import {
  useCommandStateMutation,
  useEmergencyReserveMutation,
  useOrbitalBurnMutation,
  useRefreshStation
} from "../hooks/use-station";
import { useI18n } from "../i18n/i18n-provider";
import { getErrorMessage } from "../lib/errors";
import { formatNumber, formatRelativeDate } from "../lib/format";
import { incidentLabel } from "../lib/game-labels";
import { newIdempotencyKey } from "../lib/idempotency";
import { localizeMissionLogMessage } from "../lib/mission-log-copy";

function riskMeter(station: StationState): number {
  const integrity = station.resources.hullIntegrity ?? 0;
  const incidents = station.incidents.filter((incident) => incident.status === "open").length * 12;
  const thermal = Math.max(0, station.missionTelemetry.thermalLoad - 55);
  const pressure = Math.max(0, station.missionTelemetry.hullPressure - 60);
  const score = incidents + thermal + pressure + Math.max(0, 72 - integrity) * 0.65;
  return Math.min(100, Math.max(8, score));
}

function riskLabel(score: number, t: (key: string) => string): string {
  if (score >= 76) {
    return t("dashboard.risk.high");
  }
  if (score >= 42) {
    return t("dashboard.risk.medium");
  }
  return t("dashboard.risk.low");
}

export function DashboardPage({ station }: { station: StationState }) {
  const { t, locale } = useI18n();
  const { minimalNarrativeMode } = useUiPreferences();
  const refreshStation = useRefreshStation();
  const audio = useAudio();

  const commandMutation = useCommandStateMutation();
  const orbitalBurnMutation = useOrbitalBurnMutation();
  const reserveMutation = useEmergencyReserveMutation();

  const openIncidents = station.incidents.filter((incident) => incident.status === "open");
  const damagedModules = station.modules.filter((module) => module.health < 70);
  const hullIntegrity = station.resources.hullIntegrity ?? 0;
  const tacticalRisk = riskMeter(station);
  const commandError = commandMutation.error ?? orbitalBurnMutation.error ?? reserveMutation.error;

  return (
    <section className="grid gap-4 pb-3">
      <article className="mission-theater grid gap-4 bg-[linear-gradient(180deg,rgba(8,17,30,0.66),rgba(5,11,21,0.92))] p-4 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="grid gap-3">
          <EarthViewport station={station} className="min-h-[460px]" />
          <div className="rounded-2xl border border-white/16 bg-black/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.heroEyebrow")}</p>
                <h2 className="mt-1 font-display text-3xl leading-tight text-ink-strong">{t("dashboard.heroTitle")}</h2>
              </div>
              <Radar className="h-6 w-6 text-accent-sky" />
            </div>

            {minimalNarrativeMode ? null : <p className="mt-3 text-sm text-ink-normal">{t("dashboard.heroBody")}</p>}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/14 bg-black/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.risk.label")}</p>
                <p className="mt-1 text-sm text-ink-strong">
                  {riskLabel(tacticalRisk, t)} · {formatNumber(tacticalRisk, 0)}%
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-teal/80 via-accent-amber/80 to-accent-red/80"
                    style={{ width: `${tacticalRisk}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-white/14 bg-black/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">{t("dashboard.decisionWindow")}</p>
                <p className="mt-1 text-sm text-ink-strong">
                  {t(`dashboard.telemetry.${station.missionTelemetry.deltaVWindow}`)} ·{" "}
                  {t(`dashboard.telemetry.${station.missionTelemetry.operationalRisk}`)}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{t("dashboard.decisionHint")}</p>
              </div>
            </div>
          </div>
        </div>

        <CommandDirectivePanel
          state={station.commandState}
          isUpdating={commandMutation.isPending}
          isBurning={orbitalBurnMutation.isPending}
          isReservePending={reserveMutation.isPending}
          onUpdateState={async (next) => {
            try {
              await commandMutation.mutateAsync({
                stationId: station.stationId,
                powerProfile: next.powerProfile,
                subsystemFocus: next.subsystemFocus,
                thermalPolicy: next.thermalPolicy
              });
              audio.playEffect("success");
              await refreshStation();
            } catch {
              audio.playEffect("error");
            }
          }}
          onOrbitalBurn={async () => {
            try {
              await orbitalBurnMutation.mutateAsync({
                stationId: station.stationId,
                idempotencyKey: newIdempotencyKey()
              });
              audio.playEffect("unlock");
              await refreshStation();
            } catch {
              audio.playEffect("error");
            }
          }}
          onDeployReserve={async () => {
            try {
              await reserveMutation.mutateAsync({
                stationId: station.stationId,
                idempotencyKey: newIdempotencyKey()
              });
              audio.playEffect("success");
              await refreshStation();
            } catch {
              audio.playEffect("error");
            }
          }}
        />
      </article>

      <ResourceStrip resources={station.resources} />

      <div className="grid gap-4 xl:grid-cols-[1.14fr_0.86fr]">
        <article className="console-surface p-5">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl">{t("dashboard.priority.title")}</h3>
            <ShieldAlert className="h-5 w-5 text-accent-sky" />
          </header>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="hud-stat">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.priority.openIncidents")}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-strong">{openIncidents.length}</p>
            </div>
            <div className="hud-stat">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.priority.damagedModules")}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-strong">{damagedModules.length}</p>
            </div>
            <div className="hud-stat">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.priority.integrity")}</p>
              <p className="mt-2 text-2xl font-semibold text-ink-strong">{formatNumber(hullIntegrity, 1)}%</p>
            </div>
          </div>
        </article>

        <article className="console-surface p-5">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl">{t("dashboard.threat.title")}</h3>
            <Target className="h-5 w-5 text-accent-amber" />
          </header>

          {openIncidents.length === 0 ? (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-200/6 p-4 text-sm text-emerald-200">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t("dashboard.threat.stable")}
              </p>
              {minimalNarrativeMode ? null : <p className="mt-2 text-emerald-100/80">{t("dashboard.threat.stableBody")}</p>}
            </div>
          ) : (
            <ul className="grid gap-2">
              {openIncidents.slice(0, 5).map((incident) => (
                <li key={incident.id} className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-3">
                  <p className="flex items-center gap-2 font-semibold text-accent-amber">
                    <AlertTriangle className="h-4 w-4" />
                    {incidentLabel(t, incident.type)}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t("incidents.severity")} {incident.severity} | {t("incidents.started")} {formatRelativeDate(incident.startedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="console-surface p-5">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl">{t("dashboard.logs.title")}</h3>
          <ArrowUpCircle className="h-5 w-5 text-accent-teal" />
        </header>
        {station.logs.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("dashboard.logs.empty")}</p>
        ) : (
          <ul className="mission-feed grid gap-2">
            {station.logs.slice(0, 8).map((log) => (
              <li key={log.id} className="rounded-xl border border-white/12 bg-black/22 p-3">
                <p className="text-sm text-ink-strong">{localizeMissionLogMessage(log.message, t, locale)}</p>
                <p className="mt-1 text-xs text-ink-soft">{formatRelativeDate(log.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      {commandError ? <p className="text-sm text-accent-red">{getErrorMessage(commandError)}</p> : null}
    </section>
  );
}
