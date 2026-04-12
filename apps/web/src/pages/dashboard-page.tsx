import type { StationState } from "@orbital/shared";
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  NotebookText,
  Radar,
  Rocket,
  ShieldAlert,
  Sparkles,
  Target,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { incidentLabel, incidentSeverityLabel } from "../lib/game-labels";
import { newIdempotencyKey } from "../lib/idempotency";
import { type MissionAction, type MissionPreset, deriveMissionCommandState } from "../lib/mission-command-state";
import { localizeMissionLogMessage } from "../lib/mission-log-copy";

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
  const navigate = useNavigate();
  const { report: expeditionReport } = useExpeditionReport();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionPulse, setActionPulse] = useState<"" | "directive" | "burn" | "reserve">("");

  const commandMutation = useCommandStateMutation();
  const orbitalBurnMutation = useOrbitalBurnMutation();
  const reserveMutation = useEmergencyReserveMutation();

  const missionState = useMemo(() => deriveMissionCommandState(station), [station]);
  const commandError = commandMutation.error ?? orbitalBurnMutation.error ?? reserveMutation.error;
  const pendingAction = commandMutation.isPending || orbitalBurnMutation.isPending || reserveMutation.isPending;
  const expeditionHintParam = searchParams.get("expeditionHint");
  const expeditionHint = expeditionHintParam as ExpeditionHint | null;
  const activeExpeditionHint: ExpeditionHint | null =
    expeditionHint === "command" || expeditionHint === "engineering" || expeditionHint === "research" || expeditionHint === "risk"
      ? expeditionHint
      : expeditionReport?.hint ?? null;
  const pressureLabelKey = `dashboard.pressure.${missionState.pressureBand}`;
  const degradedModules = useMemo(
    () => station.modules.filter((module) => module.health < 70 || !module.isOnline).length,
    [station.modules]
  );
  const isOrbitalWindowOpen = station.missionTelemetry.deltaVWindow === "open";
  const sectorByRoute: Record<string, string> = {
    "/dashboard": "command",
    "/research": "research",
    "/modules": "engineering",
    "/incidents": "incidents",
    "/expedition": "expedition",
    "/logs": "logs"
  };

  const sectorFocus = useMemo(
    () => [
      {
        id: "command",
        to: "/dashboard",
        titleKey: "dashboard.hub.sector.command.title",
        subtitleKey: "dashboard.hub.sector.command.subtitle",
        metric: `${missionState.objectiveProgress}%`,
        statusKey: pressureLabelKey,
        statusTone:
          missionState.pressureBand === "emergency"
            ? "text-accent-red"
            : missionState.pressureBand === "critical"
              ? "text-accent-amber"
              : missionState.pressureBand === "watch"
                ? "text-accent-sky"
                : "text-accent-teal",
        icon: Radar
      },
      {
        id: "research",
        to: "/research",
        titleKey: "dashboard.hub.sector.research.title",
        subtitleKey: "dashboard.hub.sector.research.subtitle",
        metric: formatNumber(station.resources.research ?? 0, 0),
        statusKey:
          missionState.pressureBand === "emergency" || missionState.pressureBand === "critical"
            ? "dashboard.hub.state.deferred"
            : "dashboard.hub.state.ready",
        statusTone:
          missionState.pressureBand === "emergency" || missionState.pressureBand === "critical"
            ? "text-accent-amber"
            : "text-accent-teal",
        icon: Sparkles
      },
      {
        id: "engineering",
        to: "/modules",
        titleKey: "dashboard.hub.sector.modules.title",
        subtitleKey: "dashboard.hub.sector.modules.subtitle",
        metric: `${station.modules.length - degradedModules}/${station.modules.length}`,
        statusKey: degradedModules > 0 ? "dashboard.hub.state.attention" : "dashboard.hub.state.online",
        statusTone: degradedModules > 0 ? "text-accent-amber" : "text-accent-teal",
        icon: Wrench
      },
      {
        id: "incidents",
        to: "/incidents",
        titleKey: "dashboard.hub.sector.incidents.title",
        subtitleKey: "dashboard.hub.sector.incidents.subtitle",
        metric: formatNumber(missionState.openIncidents, 0),
        statusKey: missionState.openIncidents > 0 ? "dashboard.hub.state.active" : "dashboard.hub.state.quiet",
        statusTone: missionState.openIncidents > 0 ? "text-accent-red" : "text-accent-teal",
        icon: AlertTriangle
      },
      {
        id: "expedition",
        to: "/expedition",
        titleKey: "dashboard.hub.sector.expedition.title",
        subtitleKey: "dashboard.hub.sector.expedition.subtitle",
        metric: isOrbitalWindowOpen ? t("dashboard.telemetry.open") : t("dashboard.telemetry.closed"),
        statusKey: isOrbitalWindowOpen ? "dashboard.hub.state.windowOpen" : "dashboard.hub.state.windowClosed",
        statusTone: isOrbitalWindowOpen ? "text-accent-sky" : "text-ink-soft",
        icon: Rocket
      },
      {
        id: "logs",
        to: "/logs",
        titleKey: "dashboard.hub.sector.logs.title",
        subtitleKey: "dashboard.hub.sector.logs.subtitle",
        metric: formatNumber(station.logs.length, 0),
        statusKey: "dashboard.hub.state.recording",
        statusTone: "text-accent-sky",
        icon: NotebookText
      }
    ],
    [
      degradedModules,
      isOrbitalWindowOpen,
      missionState.objectiveProgress,
      missionState.openIncidents,
      missionState.pressureBand,
      pressureLabelKey,
      station.logs.length,
      station.modules.length,
      station.resources.research,
      t
    ]
  );

  const prioritizedSectorFocus = useMemo(() => {
    const priorityIds: string[] = [];
    if (missionState.nextAction.kind === "openRoute") {
      const nextSector = sectorByRoute[missionState.nextAction.route];
      if (nextSector) {
        priorityIds.push(nextSector);
      }
    }
    if (missionState.openIncidents > 0) {
      priorityIds.push("incidents");
    }
    if (degradedModules > 0) {
      priorityIds.push("engineering");
    }
    if (missionState.pressureBand === "critical" || missionState.pressureBand === "emergency") {
      priorityIds.push("command");
    }
    if (isOrbitalWindowOpen) {
      priorityIds.push("expedition");
    }
    priorityIds.push("research", "logs", "command");

    return Array.from(new Set(priorityIds))
      .map((id) => sectorFocus.find((sector) => sector.id === id))
      .filter((sector): sector is (typeof sectorFocus)[number] => Boolean(sector))
      .slice(0, 4);
  }, [
    degradedModules,
    isOrbitalWindowOpen,
    missionState.nextAction,
    missionState.openIncidents,
    missionState.pressureBand,
    sectorFocus
  ]);

  const recommendedProfile = useMemo(() => {
    if (missionState.nextAction.kind === "applyPreset") {
      return {
        labelKey: missionState.nextAction.presetLabelKey,
        reasonKey: missionState.nextAction.titleKey,
        preset: missionState.nextAction.preset
      };
    }
    if (activeExpeditionHint && missionState.pressureBand !== "emergency") {
      return {
        labelKey: `dashboard.expeditionIntel.hint.${activeExpeditionHint}`,
        reasonKey: "dashboard.command.recommended.reason.expedition",
        preset: expeditionHintPreset[activeExpeditionHint]
      };
    }
    return null;
  }, [activeExpeditionHint, missionState.nextAction, missionState.pressureBand]);

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

  async function runPriorityAction(action: MissionAction) {
    if (action.kind === "openRoute") {
      audio.playEffect("transition");
      navigate(action.route);
      return;
    }

    if (action.kind === "applyPreset") {
      await applyPreset(action.preset, "directive");
      return;
    }

    if (action.kind === "reserve") {
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
      return;
    }

    try {
      await orbitalBurnMutation.mutateAsync({
        stationId: station.stationId,
        idempotencyKey: newIdempotencyKey()
      });
      audio.playEffect("tactical");
      window.setTimeout(() => audio.playEffect(station.runSummary.severity === "crisis" ? "emergency" : "warning"), 130);
      setActionPulse("burn");
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
      <article className="command-bridge-stage mission-theater hud-frame hud-frame--glow hud-frame--corners grid gap-4 bg-[linear-gradient(180deg,rgba(8,17,30,0.66),rgba(5,11,21,0.92))] p-4 xl:grid-cols-[1.72fr_0.88fr]">
        {actionPulse ? (
          <div className="action-pulse-banner absolute right-5 top-5 z-10 rounded-full border border-accent-sky/40 bg-black/38 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-strong">
            {t(`dashboard.actionPulse.${actionPulse}`)}
          </div>
        ) : null}

        <div className="command-scene-stack">
          <EarthViewport station={station} className="min-h-[640px]" />
          <article className="scene-mission-overlay hud-frame hud-frame--corners rounded-2xl border border-white/18 bg-black/46 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.deck.eyebrow")}</p>
                <h2 className="mt-1 font-display text-2xl leading-tight text-ink-strong">{t(missionState.primaryThreat.titleKey)}</h2>
              </div>
              <p
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]",
                  missionState.pressureBand === "emergency"
                    ? "border-accent-red/60 bg-accent-red/16 text-accent-red"
                    : missionState.pressureBand === "critical"
                      ? "border-accent-amber/60 bg-accent-amber/15 text-accent-amber"
                      : missionState.pressureBand === "watch"
                        ? "border-accent-sky/55 bg-accent-sky/14 text-accent-sky"
                        : "border-accent-teal/55 bg-accent-teal/14 text-accent-teal"
                )}
              >
                {t(pressureLabelKey)}
              </p>
            </div>
            <p className="mt-2 text-sm text-ink-normal">{t(missionState.primaryThreat.bodyKey)}</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="scene-overlay-stat rounded-xl border border-white/14 bg-black/32 p-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-ink-soft">{t("dashboard.deck.nextAction")}</p>
                <p className="mt-1 text-sm font-medium text-ink-strong">{t(missionState.nextAction.titleKey)}</p>
                <p className="mt-1 text-xs text-ink-normal">{t(missionState.nextAction.detailKey)}</p>
              </div>
              <div className="scene-overlay-stat rounded-xl border border-white/14 bg-black/32 p-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-ink-soft">{t("dashboard.objective.progress")}</p>
                <p className="mt-1 text-lg font-semibold text-ink-strong">{missionState.objectiveProgress}%</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {missionState.objectiveDone}/{missionState.objectiveTotal} {t(`dashboard.loop.${missionState.loopPhase}.title`)}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={pendingAction && missionState.nextAction.kind !== "openRoute"}
              onMouseEnter={() => audio.playEffect("hover")}
              onClick={() => {
                void runPriorityAction(missionState.nextAction);
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent-sky/60 bg-accent-sky/12 px-4 py-2 text-sm text-accent-sky transition hover:bg-accent-sky/18 disabled:opacity-45"
            >
              {t(missionState.nextAction.ctaKey)}
            </button>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {(["observe", "stabilize", "respond", "advance"] as const).map((phase) => (
                <div
                  key={phase}
                  className={cn(
                    "mission-loop-step",
                    phase === missionState.loopPhase && "mission-loop-step--current",
                    phase === "observe" ||
                      (phase === "stabilize" && missionState.objectiveDone >= 1) ||
                      (phase === "respond" && missionState.objectiveDone >= 2) ||
                      (phase === "advance" && missionState.objectiveDone >= 3)
                      ? "mission-loop-step--done"
                      : ""
                  )}
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t(`dashboard.loop.${phase}.title`)}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="tactical-command-column console-surface hud-frame hud-frame--corners p-4">
          <header className="border-b border-white/12 pb-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.deck.eyebrow")}</p>
            <h3 className="mt-1 font-display text-xl text-ink-strong">{t("dashboard.deck.title")}</h3>
            {minimalNarrativeMode ? null : <p className="mt-1 text-xs text-ink-soft">{t("dashboard.deck.body")}</p>}
          </header>

          <section className="pt-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.deck.pressure")}</p>
            <p className="mt-1 text-3xl font-semibold text-ink-strong">{formatNumber(missionState.pressureScore, 0)}%</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-teal/82 via-accent-amber/82 to-accent-red/82"
                style={{ width: `${Math.max(0, Math.min(100, missionState.pressureScore))}%` }}
              />
            </div>
            <div className="mt-2 grid gap-1 text-xs text-ink-soft">
              <p>
                {t("dashboard.objective.progress")} {missionState.objectiveProgress}% ({missionState.objectiveDone}/
                {missionState.objectiveTotal})
              </p>
              <p>
                {t("dashboard.deck.eyebrow")}: {t(`dashboard.loop.${missionState.loopPhase}.title`)}
              </p>
            </div>
          </section>

          <section className="border-t border-white/12 pt-3">
            <header className="flex items-start justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.deck.primaryThreat")}</p>
              <Target className="h-4 w-4 text-accent-amber" />
            </header>
            <p className="mt-1 text-base font-semibold text-ink-strong">{t(missionState.primaryThreat.titleKey)}</p>
            <p className="mt-1 text-sm text-ink-normal">{t(missionState.primaryThreat.bodyKey)}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-ink-soft">
              {missionState.primaryThreat.metricUnit === "percent"
                ? `${formatNumber(missionState.primaryThreat.metricValue, 0)}%`
                : formatNumber(missionState.primaryThreat.metricValue, 0)}
            </p>
          </section>

          <section className="border-t border-white/12 pt-3">
            <header className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("dashboard.hub.sectorsTitle")}</p>
              <ShieldAlert className="h-4 w-4 text-accent-sky" />
            </header>
            <div className="sector-context-grid grid gap-2">
              {prioritizedSectorFocus.map((sector) => {
                const Icon = sector.icon;
                return (
                  <Link
                    key={sector.id}
                    to={sector.to}
                    onMouseEnter={() => audio.playEffect("hover")}
                    onClick={() => audio.playEffect("click")}
                    className="sector-context-chip"
                  >
                    <div className="flex items-start gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/28">
                        <Icon className="h-3.5 w-3.5 text-accent-sky" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-strong">{t(sector.titleKey)}</p>
                        <p className="truncate text-[11px] text-ink-soft">{t(sector.subtitleKey)}</p>
                      </div>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="text-sm font-semibold text-ink-strong">{sector.metric}</p>
                      <p className={cn("text-[10px] uppercase tracking-[0.13em]", sector.statusTone)}>{t(sector.statusKey)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </aside>
      </article>

      <ResourceStrip resources={station.resources} />

      <div className="grid gap-4 xl:grid-cols-[1.24fr_0.76fr]">
        <CommandDirectivePanel
          state={station.commandState}
          isUpdating={commandMutation.isPending}
          isBurning={orbitalBurnMutation.isPending}
          isReservePending={reserveMutation.isPending}
          recommendedProfile={recommendedProfile}
          onUpdateState={async (next) => applyPreset(next)}
          onOrbitalBurn={async () => {
            await runPriorityAction({
              kind: "orbitalBurn",
              id: "executeBurn",
              titleKey: "dashboard.nextAction.primary.burn",
              detailKey: "dashboard.nextAction.detail.burn",
              ctaKey: "dashboard.nextAction.cta.burn"
            });
          }}
          onDeployReserve={async () => {
            await runPriorityAction({
              kind: "reserve",
              id: "deployReserve",
              titleKey: "dashboard.nextAction.primary.reserve",
              detailKey: "dashboard.nextAction.detail.reserve",
              ctaKey: "dashboard.nextAction.cta.reserve"
            });
          }}
        />

        <article className="depth-panel hud-frame hud-frame--corners p-5">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-ink-strong">{t("dashboard.logs.title")}</h3>
            <ArrowUpCircle className="h-5 w-5 text-accent-teal" />
          </header>

          {missionState.openIncidents === 0 ? (
            <div className="mb-3 rounded-xl border border-emerald-300/20 bg-emerald-200/6 p-3 text-sm text-emerald-200">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t("dashboard.threat.stable")}
              </p>
            </div>
          ) : (
            <ul className="mb-3 grid gap-2">
              {station.incidents
                .filter((incident) => incident.status === "open")
                .slice(0, 3)
                .map((incident) => (
                  <li key={incident.id} className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 p-3">
                    <p className="flex items-center gap-2 font-semibold text-accent-amber">
                      <AlertTriangle className="h-4 w-4" />
                      {incidentLabel(t, incident.type)}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {t("incidents.severity")} {incidentSeverityLabel(t, incident.severity)} | {t("incidents.started")}{" "}
                      {formatRelativeDate(incident.startedAt)}
                    </p>
                  </li>
                ))}
              <Link
                to="/incidents"
                onMouseEnter={() => audio.playEffect("hover")}
                onClick={() => audio.playEffect("click")}
                className="rounded-full border border-accent-amber/45 bg-accent-amber/10 px-3 py-1.5 text-center text-xs text-accent-amber transition hover:bg-accent-amber/16"
              >
                {t("dashboard.nextAction.cta.incidents")}
              </Link>
            </ul>
          )}

          {station.logs.length === 0 ? (
            <p className="text-sm text-ink-soft">{t("dashboard.logs.empty")}</p>
          ) : (
            <ul className="mission-feed grid gap-2">
              {station.logs.slice(0, 6).map((log) => (
                <li key={log.id} className="rounded-xl border border-white/12 bg-black/22 p-3">
                  <p className="text-sm text-ink-strong">{localizeMissionLogMessage(log.message, t, locale)}</p>
                  <p className="mt-1 text-xs text-ink-soft">{formatRelativeDate(log.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}

          {activeExpeditionHint ? (
            <div className="mt-3 rounded-xl border border-accent-sky/35 bg-accent-sky/[0.08] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-accent-sky">{t("dashboard.expeditionIntel.title")}</p>
              <p className="mt-1 text-sm text-ink-normal">
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
                className="mt-2 rounded-full border border-accent-teal/56 bg-accent-teal/12 px-3 py-1.5 text-xs text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-50"
              >
                {t("dashboard.expeditionIntel.apply")}
              </button>
            </div>
          ) : null}
        </article>
      </div>

      {commandError ? <p className="text-sm text-accent-red">{getErrorMessage(commandError)}</p> : null}
    </section>
  );
}
