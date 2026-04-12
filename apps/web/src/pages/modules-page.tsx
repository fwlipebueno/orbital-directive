import type { ModuleType, StationState } from "@orbital/shared";
import { Cpu, Flame, Gauge, ShieldCheck, Wrench, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAudio } from "../features/audio/audio-provider";
import { useExpeditionReport } from "../features/expedition/expedition-store";
import { useI18n } from "../i18n/i18n-provider";
import {
  useModuleRepairMutation,
  useModuleToggleMutation,
  useModuleUpgradeMutation,
  useRefreshStation
} from "../hooks/use-station";
import { cn } from "../lib/cn";
import { getErrorMessage } from "../lib/errors";
import { formatNumber } from "../lib/format";
import { newIdempotencyKey } from "../lib/idempotency";
import { moduleLabel } from "../lib/game-labels";

const topologyNodes: Array<{ type: ModuleType; x: number; y: number }> = [
  { type: "reactor", x: 50, y: 12 },
  { type: "solarArray", x: 18, y: 34 },
  { type: "lifeSupport", x: 82, y: 34 },
  { type: "hydroponics", x: 18, y: 66 },
  { type: "researchLab", x: 82, y: 66 },
  { type: "repairBay", x: 50, y: 88 }
];

const topologyEdges: Array<{ from: ModuleType; to: ModuleType; path: string }> = [
  { from: "reactor", to: "solarArray", path: "M50 12 L18 34" },
  { from: "reactor", to: "lifeSupport", path: "M50 12 L82 34" },
  { from: "solarArray", to: "hydroponics", path: "M18 34 L18 66" },
  { from: "lifeSupport", to: "researchLab", path: "M82 34 L82 66" },
  { from: "hydroponics", to: "repairBay", path: "M18 66 L50 88" },
  { from: "researchLab", to: "repairBay", path: "M82 66 L50 88" },
  { from: "reactor", to: "repairBay", path: "M50 12 L50 88" }
];

function healthTone(health: number): string {
  if (health < 35) {
    return "text-accent-red";
  }
  if (health < 65) {
    return "text-accent-amber";
  }
  return "text-accent-teal";
}

function metricGradient(value: number): string {
  if (value < 35) {
    return "from-accent-teal/85 via-accent-sky/75 to-accent-sky/50";
  }
  if (value < 65) {
    return "from-accent-amber/85 via-accent-amber/70 to-accent-amber/45";
  }
  return "from-accent-red/82 via-accent-red/66 to-accent-red/42";
}

function estimatedLoad(module: StationState["modules"][number]): number {
  if (!module.isOnline) {
    return 0;
  }
  return Math.min(100, 18 + module.level * 14 + (100 - module.health) * 0.35);
}

function estimatedHeat(module: StationState["modules"][number]): number {
  if (!module.isOnline) {
    return 8;
  }
  return Math.min(100, 20 + module.level * 11 + (100 - module.health) * 0.58);
}

function estimatedThroughput(module: StationState["modules"][number]): number {
  if (!module.isOnline) {
    return 0;
  }
  return Math.min(100, 32 + module.level * 12 + module.health * 0.42);
}

function moduleRisk(module: StationState["modules"][number]): "ok" | "warn" | "critical" {
  const heat = estimatedHeat(module);
  if (!module.isOnline || module.health < 34 || heat > 82) {
    return "critical";
  }
  if (module.health < 64 || heat > 56) {
    return "warn";
  }
  return "ok";
}

function statusClass(status: "ok" | "warn" | "critical"): string {
  if (status === "critical") {
    return "text-accent-red";
  }
  if (status === "warn") {
    return "text-accent-amber";
  }
  return "text-accent-teal";
}

export function ModulesPage({ station }: { station: StationState }) {
  const refreshStation = useRefreshStation();
  const audio = useAudio();
  const { t } = useI18n();
  const { report: expeditionReport } = useExpeditionReport();

  const upgradeMutation = useModuleUpgradeMutation();
  const repairMutation = useModuleRepairMutation();
  const toggleMutation = useModuleToggleMutation();

  const moduleMap = useMemo(() => new Map(station.modules.map((module) => [module.type, module])), [station.modules]);
  const [selectedModuleType, setSelectedModuleType] = useState<ModuleType>(station.modules[0]?.type ?? "reactor");
  const [flowBoostTick, setFlowBoostTick] = useState(0);
  const selectedModule = moduleMap.get(selectedModuleType) ?? station.modules[0];
  const loading = upgradeMutation.isPending || repairMutation.isPending || toggleMutation.isPending;
  const error = upgradeMutation.error ?? repairMutation.error ?? toggleMutation.error;
  const onlineModules = station.modules.filter((module) => module.isOnline).length;
  const averageLoad = station.modules.length
    ? station.modules.reduce((acc, module) => acc + estimatedLoad(module), 0) / station.modules.length
    : 0;
  const averageHeat = station.modules.length
    ? station.modules.reduce((acc, module) => acc + estimatedHeat(module), 0) / station.modules.length
    : 0;
  const criticalCount = station.modules.filter((module) => moduleRisk(module) === "critical").length;
  const engineeringDirective = expeditionReport?.hint === "engineering" || expeditionReport?.hint === "risk";

  useEffect(() => {
    if (!selectedModule) {
      const fallback = station.modules[0]?.type;
      if (fallback) {
        setSelectedModuleType(fallback);
      }
    }
  }, [selectedModule, station.modules]);

  useEffect(() => {
    if (!flowBoostTick) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setFlowBoostTick(0);
    }, 1400);
    return () => window.clearTimeout(timeout);
  }, [flowBoostTick]);

  function triggerFlowBoost() {
    setFlowBoostTick(Date.now());
  }

  return (
    <section className="grid gap-4">
      <header className="depth-panel flex items-center justify-between rounded-[24px] border border-white/16 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("modules.eyebrow")}</p>
          <h2 className="font-display text-2xl">{t("modules.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("modules.subtitle")}</p>
        </div>
        <Wrench className="h-6 w-6 text-accent-sky" />
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="engineering-theater depth-panel rounded-[24px] border border-white/14 p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.18em] text-ink-soft">{t("modules.flow")}</h3>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("modules.deckLive")}</p>
          </header>

          {engineeringDirective ? (
            <div className="mb-3 rounded-xl border border-accent-sky/38 bg-accent-sky/[0.08] px-3 py-2 text-xs text-ink-normal">
              {t("modules.expeditionHint")}
            </div>
          ) : null}

          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/14 bg-black/26 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.online")}</p>
              <p className="mt-1 text-base text-ink-strong">
                {onlineModules}/{station.modules.length}
              </p>
            </div>
            <div className="rounded-xl border border-white/14 bg-black/26 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.load")}</p>
              <p className="mt-1 text-base text-ink-strong">{formatNumber(averageLoad, 0)}%</p>
            </div>
            <div className="rounded-xl border border-white/14 bg-black/26 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.heat")}</p>
              <p className={cn("mt-1 text-base", healthTone(averageHeat))}>{formatNumber(averageHeat, 0)}%</p>
            </div>
            <div className="rounded-xl border border-white/14 bg-black/26 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.alerts")}</p>
              <p className={cn("mt-1 text-base", criticalCount > 0 ? "text-accent-red" : "text-accent-teal")}>
                {criticalCount}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[20px] border border-white/14 bg-black/28 p-4">
            <div className={cn("engineering-core-glow pointer-events-none absolute inset-0", flowBoostTick > 0 && "engineering-core-glow--boost")} />
            <div className="engineering-grid-overlay pointer-events-none absolute inset-0" />
            <div className="engineering-scanline pointer-events-none absolute inset-0" />
            <svg viewBox="0 0 100 100" className="h-[410px] w-full">
              <defs>
                <radialGradient id="deckCoreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(122,208,255,0.58)" />
                  <stop offset="100%" stopColor="rgba(122,208,255,0)" />
                </radialGradient>
                <radialGradient id="selectedNodeGlow" cx="50%" cy="50%" r="62%">
                  <stop offset="0%" stopColor="rgba(122,208,255,0.44)" />
                  <stop offset="100%" stopColor="rgba(122,208,255,0)" />
                </radialGradient>
                <radialGradient id="nodeShell" cx="36%" cy="32%" r="72%">
                  <stop offset="0%" stopColor="rgba(188,218,255,0.76)" />
                  <stop offset="42%" stopColor="rgba(88,131,186,0.72)" />
                  <stop offset="100%" stopColor="rgba(23,43,72,0.9)" />
                </radialGradient>
                <radialGradient id="nodeInner" cx="42%" cy="34%" r="66%">
                  <stop offset="0%" stopColor="rgba(240,248,255,0.86)" />
                  <stop offset="100%" stopColor="rgba(77,176,255,0.18)" />
                </radialGradient>
              </defs>

              <circle cx={50} cy={50} r={30} fill="url(#deckCoreGlow)" />
              <path d="M50 12L18 34L18 66L50 88L82 66L82 34Z" className="fill-none stroke-white/18 stroke-[0.85]" />
              <path d="M12 50L88 50" className="stroke-white/10 stroke-[0.6]" />
              <path d="M50 7L50 93" className="stroke-white/10 stroke-[0.6]" />

              {topologyEdges.map((edge, edgeIndex) => {
                const fromModule = moduleMap.get(edge.from);
                const toModule = moduleMap.get(edge.to);
                const active = Boolean(fromModule?.isOnline && toModule?.isOnline);
                const highlighted = edge.from === selectedModuleType || edge.to === selectedModuleType;
                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <path
                      d={edge.path}
                      className={`power-link ${active ? "power-link--active" : "power-link--idle"}`}
                      style={{
                        opacity: selectedModuleType && !highlighted ? 0.38 : 1,
                        strokeWidth: highlighted ? 1.95 : 1.4
                      }}
                    />
                    {active ? (
                      <>
                        <circle className="power-packet" r={1.1}>
                          <animateMotion dur={`${2 + edgeIndex * 0.22}s`} repeatCount="indefinite" path={edge.path} />
                        </circle>
                        <circle className="power-packet" r={0.9}>
                          <animateMotion
                            dur={`${2 + edgeIndex * 0.22}s`}
                            begin={`${0.9 + edgeIndex * 0.14}s`}
                            repeatCount="indefinite"
                            path={edge.path}
                          />
                        </circle>
                      </>
                    ) : null}
                  </g>
                );
              })}

              {topologyNodes.map((node) => {
                const module = moduleMap.get(node.type);
                const online = module?.isOnline ?? false;
                const selected = selectedModuleType === node.type;
                const risk = module ? moduleRisk(module) : "critical";
                const ringColor = risk === "critical" ? "#ff8f8f" : risk === "warn" ? "#f4d37e" : "#7ad0ff";
                const coreColor = risk === "critical" ? "rgba(255,143,143,0.92)" : risk === "warn" ? "rgba(244,211,126,0.92)" : "rgba(104,231,206,0.92)";
                return (
                  <g
                    key={node.type}
                    transform={`translate(${node.x},${node.y})`}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedModuleType(node.type);
                      triggerFlowBoost();
                      audio.playEffect("click");
                    }}
                    onMouseEnter={() => audio.playEffect("hover")}
                  >
                    <circle cx={0} cy={0} r={13.4} fill={selected ? "url(#selectedNodeGlow)" : "transparent"} />
                    <circle cx={0} cy={0} r={10.8} fill="url(#nodeShell)" stroke="rgba(255,255,255,0.24)" strokeWidth={1.2} />
                    <circle
                      cx={0}
                      cy={0}
                      r={9.2}
                      fill="rgba(8,24,44,0.45)"
                      stroke={online ? ringColor : "rgba(255,255,255,0.4)"}
                      strokeWidth={1.7}
                    />
                    <circle cx={0} cy={0} r={5.6} fill="url(#nodeInner)" />
                    <circle cx={0} cy={0} r={4.3} className="power-pulse" fill={coreColor} />
                    {selected ? <circle cx={0} cy={0} r={12.4} fill="none" stroke="rgba(122,208,255,0.72)" strokeWidth={1} /> : null}
                    <text x={0} y={-13.5} className="fill-white/78 text-[3px] tracking-[0.22em]" textAnchor="middle">
                      {moduleLabel(t, node.type)}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-accent-sky/80" /> {t("modules.flowActive")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-white/40" /> {t("modules.flowIdle")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-accent-amber/80" /> {t("modules.flowHeat")}
              </span>
            </div>
          </div>
        </article>

        <aside className="depth-panel rounded-[24px] border border-white/14 p-4">
          {selectedModule ? (
            <div className="grid gap-3">
              <header className="rounded-[18px] border border-white/14 bg-black/26 p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("modules.focusPanel")}</p>
                <h3 className="mt-2 font-display text-2xl text-ink-strong">{moduleLabel(t, selectedModule.type)}</h3>
                <p className="mt-1 text-xs text-ink-soft">
                  {selectedModule.isOnline ? t("modules.flowOnline") : t("modules.flowOffline")} | {t("modules.level")}{" "}
                  {selectedModule.level}
                </p>
              </header>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.integrity")}</p>
                  <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm", healthTone(selectedModule.health))}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {formatNumber(selectedModule.health, 0)}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.flow")}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-accent-sky">
                    <Zap className="h-3.5 w-3.5" />
                    {formatNumber(estimatedThroughput(selectedModule), 0)}%
                  </p>
                </div>
                <div className="rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.metric.thermal")}</p>
                  <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm", healthTone(estimatedHeat(selectedModule)))}>
                    <Flame className="h-3.5 w-3.5" />
                    {formatNumber(estimatedHeat(selectedModule), 0)}%
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                {[
                  { key: "modules.health", value: selectedModule.health },
                  { key: "modules.load", value: estimatedLoad(selectedModule) },
                  { key: "modules.heat", value: estimatedHeat(selectedModule) },
                  { key: "modules.throughput", value: estimatedThroughput(selectedModule) }
                ].map((metric) => (
                  <div key={metric.key} className="rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                      <span>{t(metric.key)}</span>
                      <span className={healthTone(metric.value)}>{formatNumber(metric.value, 0)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                      <div
                        className={cn("h-full rounded-full bg-gradient-to-r", metricGradient(metric.value))}
                        style={{ width: `${Math.max(0, Math.min(100, metric.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.riskPanel")}</p>
                <p className={cn("mt-1 text-sm", statusClass(moduleRisk(selectedModule)))}>
                  <Gauge className="mr-1.5 inline h-4 w-4" />
                  {t(`modules.risk.${moduleRisk(selectedModule)}`)}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{t(`modules.state.${moduleRisk(selectedModule)}`)}</p>
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerFlowBoost();
                    audio.playEffect("transition");
                    window.setTimeout(() => audio.playEffect("tactical"), 120);
                  }}
                  className="rounded-full border border-accent-amber/45 bg-accent-amber/[0.09] px-3 py-2 text-sm text-accent-amber transition hover:bg-accent-amber/[0.14]"
                >
                  {t("modules.routePulse")}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      await upgradeMutation.mutateAsync({
                        stationId: station.stationId,
                        moduleType: selectedModule.type,
                        idempotencyKey: newIdempotencyKey()
                      });
                      audio.playEffect("tactical");
                      window.setTimeout(() => audio.playEffect("confirm"), 120);
                      triggerFlowBoost();
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-accent-sky/55 bg-accent-sky/12 px-3 py-2 text-sm text-accent-sky transition hover:bg-accent-sky/18 disabled:opacity-60"
                >
                  {t("modules.upgrade")}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      await repairMutation.mutateAsync({
                        stationId: station.stationId,
                        moduleType: selectedModule.type,
                        idempotencyKey: newIdempotencyKey()
                      });
                      audio.playEffect("tactical");
                      window.setTimeout(() => audio.playEffect("confirm"), 120);
                      triggerFlowBoost();
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-accent-teal/55 bg-accent-teal/12 px-3 py-2 text-sm text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-60"
                >
                  {t("modules.repair")}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      await toggleMutation.mutateAsync({
                        stationId: station.stationId,
                        moduleType: selectedModule.type,
                        isOnline: !selectedModule.isOnline
                      });
                      audio.playEffect(selectedModule.isOnline ? "warning" : "confirm");
                      triggerFlowBoost();
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-white/24 bg-white/[0.03] px-3 py-2 text-sm text-ink-normal transition hover:bg-white/10 disabled:opacity-60"
                >
                  {selectedModule.isOnline ? t("modules.disable") : t("modules.enable")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">{t("modules.empty")}</p>
          )}
        </aside>
      </div>

      <article className="depth-panel rounded-[22px] border border-white/14 p-3">
        <div className="flex flex-wrap gap-2">
          {station.modules.map((module) => {
            const risk = moduleRisk(module);
            return (
              <button
                key={module.id}
                type="button"
                onMouseEnter={() => audio.playEffect("hover")}
                onClick={() => {
                  setSelectedModuleType(module.type);
                  triggerFlowBoost();
                  audio.playEffect("click");
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                  selectedModuleType === module.type
                    ? "border-accent-sky/60 bg-accent-sky/14 text-ink-strong"
                    : "border-white/16 bg-black/20 text-ink-soft hover:border-accent-sky/42 hover:text-ink-normal"
                )}
              >
                <Cpu className={cn("h-3.5 w-3.5", statusClass(risk))} />
                {moduleLabel(t, module.type)}
                <span className={cn("font-mono", healthTone(module.health))}>{formatNumber(module.health, 0)}%</span>
              </button>
            );
          })}
        </div>
      </article>

      {error ? <p className="text-sm text-accent-red">{getErrorMessage(error)}</p> : null}
    </section>
  );
}
