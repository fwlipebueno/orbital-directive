import type { ModuleType, StationState } from "@orbital/shared";
import { Activity, Cpu, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import {
  useModuleRepairMutation,
  useModuleToggleMutation,
  useModuleUpgradeMutation,
  useRefreshStation
} from "../hooks/use-station";
import { getErrorMessage } from "../lib/errors";
import { formatNumber } from "../lib/format";
import { newIdempotencyKey } from "../lib/idempotency";
import { moduleLabel } from "../lib/game-labels";

const topologyNodes: Array<{ type: ModuleType; x: number; y: number }> = [
  { type: "reactor", x: 50, y: 14 },
  { type: "solarArray", x: 20, y: 34 },
  { type: "lifeSupport", x: 80, y: 34 },
  { type: "hydroponics", x: 20, y: 62 },
  { type: "researchLab", x: 80, y: 62 },
  { type: "repairBay", x: 50, y: 86 }
];

const topologyEdges: Array<{ from: ModuleType; to: ModuleType; path: string }> = [
  { from: "reactor", to: "solarArray", path: "M50 14 L20 34" },
  { from: "reactor", to: "lifeSupport", path: "M50 14 L80 34" },
  { from: "solarArray", to: "hydroponics", path: "M20 34 L20 62" },
  { from: "lifeSupport", to: "researchLab", path: "M80 34 L80 62" },
  { from: "hydroponics", to: "repairBay", path: "M20 62 L50 86" },
  { from: "researchLab", to: "repairBay", path: "M80 62 L50 86" },
  { from: "reactor", to: "repairBay", path: "M50 14 L50 86" }
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

function metricBar(value: number): string {
  if (value < 35) {
    return "from-accent-teal/80 to-accent-sky/55";
  }
  if (value < 65) {
    return "from-accent-amber/80 to-accent-amber/45";
  }
  return "from-accent-red/82 to-accent-red/48";
}

function estimatedLoad(module: StationState["modules"][number]): number {
  if (!module.isOnline) {
    return 0;
  }
  return Math.min(100, 22 + module.level * 15 + (100 - module.health) * 0.34);
}

function estimatedHeat(module: StationState["modules"][number]): number {
  if (!module.isOnline) {
    return 8;
  }
  return Math.min(100, 18 + module.level * 12 + (100 - module.health) * 0.52);
}

function moduleRisk(module: StationState["modules"][number]): "ok" | "warn" | "critical" {
  if (!module.isOnline || module.health < 36) {
    return "critical";
  }
  if (module.health < 65 || estimatedHeat(module) > 58) {
    return "warn";
  }
  return "ok";
}

export function ModulesPage({ station }: { station: StationState }) {
  const refreshStation = useRefreshStation();
  const audio = useAudio();
  const { t } = useI18n();

  const upgradeMutation = useModuleUpgradeMutation();
  const repairMutation = useModuleRepairMutation();
  const toggleMutation = useModuleToggleMutation();

  const [focusedModuleType, setFocusedModuleType] = useState<ModuleType | null>(null);

  const error = upgradeMutation.error ?? repairMutation.error ?? toggleMutation.error;
  const moduleMap = useMemo(() => new Map(station.modules.map((module) => [module.type, module])), [station.modules]);

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

      <article className="depth-panel rounded-[24px] border border-white/14 p-4">
        <h3 className="mb-3 text-xs uppercase tracking-[0.16em] text-ink-soft">{t("modules.flow")}</h3>
        <div className="overflow-hidden rounded-[18px] border border-white/14 bg-black/26 p-4">
          <svg viewBox="0 0 100 100" className="h-[320px] w-full">
            <defs>
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(122,208,255,0.5)" />
                <stop offset="100%" stopColor="rgba(122,208,255,0)" />
              </radialGradient>
              <radialGradient id="nodeGlow" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="rgba(122,208,255,0.34)" />
                <stop offset="100%" stopColor="rgba(122,208,255,0)" />
              </radialGradient>
            </defs>

            <rect x={2.5} y={2.5} width={95} height={95} rx={8} className="fill-none stroke-white/16 stroke-[0.55]" />
            <circle cx={50} cy={50} r={28} fill="url(#coreGlow)" />
            <path d="M50 14L20 34L20 62L50 86L80 62L80 34Z" className="fill-none stroke-white/18 stroke-[0.8]" />

            {topologyEdges.map((edge) => {
              const fromModule = moduleMap.get(edge.from);
              const toModule = moduleMap.get(edge.to);
              const active = Boolean(fromModule?.isOnline && toModule?.isOnline);
              const focused = focusedModuleType === edge.from || focusedModuleType === edge.to;
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={edge.path}
                    className={`power-link ${active ? "power-link--active" : "power-link--idle"}`}
                    style={{
                      opacity: focusedModuleType && !focused ? 0.4 : 1,
                      strokeWidth: focused ? 1.7 : 1.35
                    }}
                  />
                  {active ? (
                    <>
                      <circle className="power-packet" r={1.1}>
                        <animateMotion dur="2.6s" repeatCount="indefinite" path={edge.path} />
                      </circle>
                      <circle className="power-packet" r={0.9}>
                        <animateMotion dur="2.6s" begin="1.1s" repeatCount="indefinite" path={edge.path} />
                      </circle>
                    </>
                  ) : null}
                </g>
              );
            })}

            {topologyNodes.map((node) => {
              const module = moduleMap.get(node.type);
              const online = module?.isOnline ?? false;
              const health = module?.health ?? 0;
              const selected = focusedModuleType === node.type;
              const ring = online ? "stroke-accent-sky/70" : "stroke-white/28";
              return (
                <g
                  key={node.type}
                  transform={`translate(${node.x},${node.y})`}
                  onMouseEnter={() => setFocusedModuleType(node.type)}
                  onMouseLeave={() => setFocusedModuleType(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={0} cy={0} r={12.5} fill="url(#nodeGlow)" opacity={selected ? 0.8 : 0.45} />
                  <circle cx={0} cy={0} r={10.6} className="fill-black/72 stroke-white/16 stroke-[1.2]" />
                  <circle cx={0} cy={0} r={8.9} className={`fill-black/60 ${ring} stroke-[1.5]`} />
                  <circle
                    cx={0}
                    cy={0}
                    r={5.25}
                    className={
                      health < 35
                        ? "power-pulse fill-accent-red/75"
                        : health < 65
                          ? "power-pulse fill-accent-amber/75"
                          : "power-pulse fill-accent-teal/75"
                    }
                  />
                  <text x={0} y={-13.2} className="fill-white/78 text-[3px] tracking-[0.22em]" textAnchor="middle">
                    {node.type}
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

      <div className="grid gap-3">
        {station.modules.map((module) => {
          const loading = upgradeMutation.isPending || repairMutation.isPending || toggleMutation.isPending;
          const load = estimatedLoad(module);
          const heat = estimatedHeat(module);
          const risk = moduleRisk(module);

          return (
            <article
              key={module.id}
              onMouseEnter={() => setFocusedModuleType(module.type)}
              onMouseLeave={() => setFocusedModuleType(null)}
              className="group rounded-[20px] border border-white/14 bg-[linear-gradient(110deg,rgba(10,18,30,0.82),rgba(7,13,23,0.9))] p-4 transition hover:border-accent-sky/45 hover:bg-[linear-gradient(110deg,rgba(10,22,36,0.9),rgba(7,13,23,0.92))]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg text-ink-strong">{moduleLabel(t, module.type)}</h3>
                  <p className="mt-1 text-xs text-ink-soft">
                    <Activity className="mr-1 inline h-3.5 w-3.5" />
                    {module.isOnline ? t("modules.flowOnline") : t("modules.flowOffline")} | {t("modules.level")} {module.level}
                  </p>
                </div>

                <p className={`font-mono text-sm ${healthTone(module.health)}`}>
                  {t("modules.health")}: {formatNumber(module.health, 1)}%
                </p>

                <p
                  className={
                    risk === "critical"
                      ? "text-xs text-accent-red"
                      : risk === "warn"
                        ? "text-xs text-accent-amber"
                        : "text-xs text-accent-teal"
                  }
                >
                  <Cpu className="mr-1 inline h-3.5 w-3.5" />
                  {t(`modules.risk.${risk}`)}
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/12 bg-black/22 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.load")}</p>
                  <p className="mt-1 text-sm text-ink-strong">{formatNumber(load, 0)}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${metricBar(load)}`} style={{ width: `${load}%` }} />
                  </div>
                </div>

                <div className="rounded-xl border border-white/12 bg-black/22 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("modules.heat")}</p>
                  <p className="mt-1 text-sm text-ink-strong">{formatNumber(heat, 0)}%</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${metricBar(heat)}`} style={{ width: `${heat}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      await upgradeMutation.mutateAsync({
                        stationId: station.stationId,
                        moduleType: module.type,
                        idempotencyKey: newIdempotencyKey()
                      });
                      audio.playEffect("success");
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-accent-sky/50 px-3 py-1.5 text-xs text-accent-sky transition hover:bg-accent-sky/10 disabled:opacity-60"
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
                        moduleType: module.type,
                        idempotencyKey: newIdempotencyKey()
                      });
                      audio.playEffect("success");
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-accent-teal/50 px-3 py-1.5 text-xs text-accent-teal transition hover:bg-accent-teal/10 disabled:opacity-60"
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
                        moduleType: module.type,
                        isOnline: !module.isOnline
                      });
                      audio.playEffect(module.isOnline ? "alert" : "click");
                      await refreshStation();
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-ink-normal transition hover:bg-white/10 disabled:opacity-60"
                >
                  {module.isOnline ? t("modules.disable") : t("modules.enable")}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {error ? <p className="text-sm text-accent-red">{getErrorMessage(error)}</p> : null}
    </section>
  );
}
