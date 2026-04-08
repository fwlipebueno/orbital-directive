import type { StationState } from "@orbital/shared";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Radar, ShieldAlert, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUiPreferences } from "../app/ui-context";
import { CommandDirectivePanel } from "../components/command-directive-panel";
import { EarthViewport } from "../components/earth-viewport";
import { ResourceStrip } from "../components/resource-strip";
import { useAudio } from "../features/audio/audio-provider";
import { type ExpeditionHint, useExpeditionReport } from "../features/expedition/expedition-store";
import {
  useCommandStateMutation,
  useEmergencyReserveMutation,
  useOrbitalBurnMutation,
  useRefreshStation
} from "../hooks/use-station";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
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

type MissionPreset = {
  powerProfile: StationState["commandState"]["powerProfile"];
  subsystemFocus: StationState["commandState"]["subsystemFocus"];
  thermalPolicy: StationState["commandState"]["thermalPolicy"];
};

const expeditionHintPreset: Record<ExpeditionHint, MissionPreset> = {
  command: { powerProfile: "balanced", subsystemFocus: "morale", thermalPolicy: "nominal" },
  engineering: { powerProfile: "lifeSupport", subsystemFocus: "integrity", thermalPolicy: "economy" },
  research: { powerProfile: "research", subsystemFocus: "research", thermalPolicy: "boost" },
  risk: { powerProfile: "shielded", subsystemFocus: "integrity", thermalPolicy: "nominal" }
};

export function DashboardPage({ station }: { station: StationState }) {
  const { t, locale } = useI18n();
  const { minimalNarrativeMode } = useUiPreferences();
  const refreshStation = useRefreshStation();
  const audio = useAudio();
  const { report: expeditionReport } = useExpeditionReport();
  const [searchParams, setSearchParams] = useSearchParams();

  const commandMutation = useCommandStateMutation();
  const orbitalBurnMutation = useOrbitalBurnMutation();
  const reserveMutation = useEmergencyReserveMutation();

  const [actionPulse, setActionPulse] = useState<"" | "directive" | "burn" | "reserve">("");
  const openIncidents = station.incidents.filter((incident) => incident.status === "open");
  const damagedModules = station.modules.filter((module) => module.health < 70);
  const hullIntegrity = station.resources.hullIntegrity ?? 0;
  const tacticalRisk = riskMeter(station);
  const commandError = commandMutation.error ?? orbitalBurnMutation.error ?? reserveMutation.error;
  const expeditionHintParam = searchParams.get("expeditionHint");
  const expeditionHint = expeditionHintParam as ExpeditionHint | null;
  const coreResourcesSafe =
    (station.resources.energy ?? 0) >= 35 &&
    (station.resources.oxygen ?? 0) >= 35 &&
    (station.resources.water ?? 0) >= 35 &&
    (station.resources.food ?? 0) >= 35;
  const objectives = [
    coreResourcesSafe,
    hullIntegrity >= 62,
    openIncidents.length === 0,
    station.missionTelemetry.thermalLoad <= 68
  ];
  const objectiveDone = objectives.filter(Boolean).length;
  const objectiveProgress = Math.round((objectiveDone / objectives.length) * 100);
  const nextActionKey =
    openIncidents.length > 0
      ? "incidents"
      : hullIntegrity < 62 || damagedModules.length > 2
        ? "hull"
        : station.missionTelemetry.thermalLoad > 72
          ? "thermal"
          : !coreResourcesSafe
            ? "resources"
            : "research";

  const missionPresets: Array<{ id: string; labelKey: string; preset: MissionPreset }> = [
    {
      id: "stabilize",
      labelKey: "dashboard.preset.stabilize",
      preset: { powerProfile: "lifeSupport", subsystemFocus: "integrity", thermalPolicy: "economy" }
    },
    {
      id: "research",
      labelKey: "dashboard.preset.research",
      preset: { powerProfile: "research", subsystemFocus: "research", thermalPolicy: "boost" }
    },
    {
      id: "containment",
      labelKey: "dashboard.preset.containment",
      preset: { powerProfile: "shielded", subsystemFocus: "integrity", thermalPolicy: "nominal" }
    }
  ];
  const activeExpeditionHint: ExpeditionHint | null =
    expeditionHint === "command" || expeditionHint === "engineering" || expeditionHint === "research" || expeditionHint === "risk"
      ? expeditionHint
      : expeditionReport?.hint ?? null;

  async function applyPreset(preset: MissionPreset, pulse: "directive" | "burn" | "reserve" = "directive") {
    try {
      await commandMutation.mutateAsync({
        stationId: station.stationId,
        powerProfile: preset.powerProfile,
        subsystemFocus: preset.subsystemFocus,
        thermalPolicy: preset.thermalPolicy
      });
      audio.playEffect("tactical");
      window.setTimeout(() => audio.playEffect("confirm"), 120);
      setActionPulse(pulse);
      await refreshStation();
    } catch {
      audio.playEffect("error");
    }
  }

  useEffect(() => {
    if (!actionPulse) {
      return;
    }
    const timeoutId = window.setTimeout(() => setActionPulse(""), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [actionPulse]);

  return (
    <section className="grid gap-4 pb-3">
      <article className="mission-theater grid gap-4 bg-[linear-gradient(180deg,rgba(8,17,30,0.66),rgba(5,11,21,0.92))] p-4 xl:grid-cols-[1.6fr_0.9fr]">
        {actionPulse ? (
          <div className="action-pulse-banner absolute right-5 top-5 z-10 rounded-full border border-accent-sky/40 bg-black/38 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-strong">
            {t(`dashboard.actionPulse.${actionPulse}`)}
          </div>
        ) : null}
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
                  {riskLabel(tacticalRisk, t)} | {formatNumber(tacticalRisk, 0)}%
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
                  {t(`dashboard.telemetry.${station.missionTelemetry.deltaVWindow}`)} |{" "}
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
          onUpdateState={async (next) => applyPreset(next)}
          onOrbitalBurn={async () => {
            try {
              await orbitalBurnMutation.mutateAsync({
                stationId: station.stationId,
                idempotencyKey: newIdempotencyKey()
              });
              audio.playEffect("tactical");
              window.setTimeout(
                () => audio.playEffect(station.runSummary.severity === "crisis" ? "emergency" : "warning"),
                130
              );
              setActionPulse("burn");
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
              audio.playEffect("tactical");
              window.setTimeout(() => audio.playEffect("confirm"), 130);
              setActionPulse("reserve");
              await refreshStation();
            } catch {
              audio.playEffect("error");
            }
          }}
        />
      </article>

      <article className="mission-loop-board grid gap-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.objective.eyebrow")}</p>
            <h3 className="mt-1 font-display text-xl text-ink-strong">{t("dashboard.objective.title")}</h3>
            <p className="mt-1 text-sm text-ink-normal">{t("dashboard.objective.body")}</p>
          </div>
          <p className="rounded-full border border-white/16 bg-black/20 px-3 py-1.5 text-sm text-ink-strong">
            {t("dashboard.objective.progress")} {objectiveProgress}%
          </p>
        </header>

        <div className="h-1.5 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-teal/80 via-accent-sky/82 to-accent-amber/78"
            style={{ width: `${Math.max(0, Math.min(100, objectiveProgress))}%` }}
          />
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {[
            { key: "observe", done: true, current: nextActionKey === "resources" || nextActionKey === "thermal" },
            { key: "stabilize", done: coreResourcesSafe && hullIntegrity >= 62, current: nextActionKey === "hull" },
            { key: "respond", done: openIncidents.length === 0, current: nextActionKey === "incidents" },
            { key: "debrief", done: objectiveProgress >= 90 && openIncidents.length === 0, current: nextActionKey === "research" }
          ].map((step) => (
            <div
              key={step.key}
              className={cn(
                "mission-loop-step",
                step.done && "mission-loop-step--done",
                step.current && "mission-loop-step--current"
              )}
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t(`dashboard.loop.${step.key}.title`)}</p>
              <p className="mt-1 text-xs text-ink-normal">{t(`dashboard.loop.${step.key}.body`)}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-accent-sky">
          {t("dashboard.nextAction.title")} {t(`dashboard.nextAction.${nextActionKey}`)}
        </p>
      </article>

      <ResourceStrip resources={station.resources} />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="console-surface p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg text-ink-strong">{t("dashboard.expeditionIntel.title")}</h3>
            <Link
              to="/expedition"
              onMouseEnter={() => audio.playEffect("hover")}
              onClick={() => audio.playEffect("click")}
              className="rounded-full border border-accent-sky/52 bg-accent-sky/12 px-3 py-1.5 text-xs text-accent-sky transition hover:bg-accent-sky/18"
            >
              {t("shell.nav.expedition")}
            </Link>
          </header>

          {activeExpeditionHint ? (
            <div className="grid gap-3">
              <p className="text-sm text-ink-normal">
                {t("dashboard.expeditionIntel.hintLabel")} {t(`dashboard.expeditionIntel.hint.${activeExpeditionHint}`)}
              </p>
              <button
                type="button"
                disabled={commandMutation.isPending}
                onClick={async () => {
                  await applyPreset(expeditionHintPreset[activeExpeditionHint]);
                  if (expeditionHint) {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete("expeditionHint");
                    setSearchParams(nextParams, { replace: true });
                  }
                }}
                className="rounded-full border border-accent-teal/56 bg-accent-teal/12 px-3 py-2 text-sm text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-50"
              >
                {t("dashboard.expeditionIntel.apply")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">{t("dashboard.expeditionIntel.empty")}</p>
          )}
        </article>

        <article className="console-surface p-4">
          <header className="mb-3">
            <h3 className="font-display text-lg text-ink-strong">{t("dashboard.preset.title")}</h3>
          </header>
          <div className="grid gap-2 sm:grid-cols-3">
            {missionPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={commandMutation.isPending}
                onMouseEnter={() => audio.playEffect("hover")}
                onClick={async () => {
                  await applyPreset(preset.preset);
                }}
                className="rounded-xl border border-white/18 bg-black/22 px-3 py-2 text-sm text-ink-normal transition hover:border-accent-sky/52 hover:text-ink-strong disabled:opacity-50"
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </article>
      </div>

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
