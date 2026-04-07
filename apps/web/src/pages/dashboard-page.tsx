import type { StationState } from "@orbital/shared";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Radar, ShieldAlert } from "lucide-react";
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
  const commandError = commandMutation.error ?? orbitalBurnMutation.error ?? reserveMutation.error;

  return (
    <section className="grid gap-4 pb-3">
      <article className="mission-theater grid gap-4 rounded-[26px] border border-white/15 bg-[linear-gradient(180deg,rgba(8,17,30,0.64),rgba(5,11,21,0.9))] p-4 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="grid gap-3">
          <EarthViewport station={station} className="min-h-[410px]" />
          <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.heroEyebrow")}</p>
                <h2 className="mt-1 font-display text-3xl leading-tight text-ink-strong">{t("dashboard.heroTitle")}</h2>
              </div>
              <Radar className="h-6 w-6 text-accent-sky" />
            </div>

            {minimalNarrativeMode ? null : <p className="mt-3 text-sm text-ink-normal">{t("dashboard.heroBody")}</p>}

            <div className="mt-4 grid gap-2 text-xs text-ink-soft sm:grid-cols-2">
              <p>
                {t("dashboard.telemetry.solarExposure")}:{" "}
                <span className="text-ink-strong">{formatNumber(station.missionTelemetry.solarExposure * 100, 1)}%</span>
              </p>
              <p>
                {t("dashboard.telemetry.orbitalStability")}:{" "}
                <span className="text-ink-strong">{formatNumber(station.missionTelemetry.orbitalStability, 1)}%</span>
              </p>
              <p>
                {t("dashboard.telemetry.thermalLoad")}:{" "}
                <span className="text-ink-strong">{formatNumber(station.missionTelemetry.thermalLoad, 1)}%</span>
              </p>
              <p>
                {t("dashboard.telemetry.hullPressure")}:{" "}
                <span className="text-ink-strong">{formatNumber(station.missionTelemetry.hullPressure, 1)}%</span>
              </p>
              <p>
                {t("dashboard.telemetry.deltaVWindow")}:{" "}
                <span className="text-ink-strong">{t(`dashboard.telemetry.${station.missionTelemetry.deltaVWindow}`)}</span>
              </p>
              <p>
                {t("dashboard.telemetry.risk")}:{" "}
                <span className="text-ink-strong">{t(`dashboard.telemetry.${station.missionTelemetry.operationalRisk}`)}</span>
              </p>
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

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="console-surface rounded-2xl p-5">
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

        <article className="console-surface rounded-2xl p-5">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl">{t("dashboard.threat.title")}</h3>
            <ShieldAlert className="h-5 w-5 text-accent-amber" />
          </header>

          {openIncidents.length === 0 ? (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-200/5 p-4 text-sm text-emerald-200">
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

      <article className="console-surface rounded-2xl p-5">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl">{t("dashboard.logs.title")}</h3>
          <ArrowUpCircle className="h-5 w-5 text-accent-teal" />
        </header>
        {station.logs.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("dashboard.logs.empty")}</p>
        ) : (
          <ul className="mission-feed grid gap-2">
            {station.logs.slice(0, 8).map((log) => (
              <li key={log.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
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
