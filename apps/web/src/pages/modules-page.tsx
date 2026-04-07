import type { ModuleType, StationState } from "@orbital/shared";
import { Activity, Wrench } from "lucide-react";
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
  { type: "reactor", x: 50, y: 18 },
  { type: "solarArray", x: 20, y: 38 },
  { type: "lifeSupport", x: 80, y: 38 },
  { type: "hydroponics", x: 20, y: 67 },
  { type: "researchLab", x: 80, y: 67 },
  { type: "repairBay", x: 50, y: 84 }
];

const topologyEdges: Array<{ from: ModuleType; to: ModuleType; path: string }> = [
  { from: "reactor", to: "solarArray", path: "M50 18 L20 38" },
  { from: "reactor", to: "lifeSupport", path: "M50 18 L80 38" },
  { from: "solarArray", to: "hydroponics", path: "M20 38 L20 67" },
  { from: "lifeSupport", to: "researchLab", path: "M80 38 L80 67" },
  { from: "hydroponics", to: "repairBay", path: "M20 67 L50 84" },
  { from: "researchLab", to: "repairBay", path: "M80 67 L50 84" },
  { from: "reactor", to: "repairBay", path: "M50 18 L50 84" }
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

export function ModulesPage({ station }: { station: StationState }) {
  const refreshStation = useRefreshStation();
  const audio = useAudio();
  const { t } = useI18n();

  const upgradeMutation = useModuleUpgradeMutation();
  const repairMutation = useModuleRepairMutation();
  const toggleMutation = useModuleToggleMutation();

  const error = upgradeMutation.error ?? repairMutation.error ?? toggleMutation.error;
  const moduleMap = new Map(station.modules.map((module) => [module.type, module]));

  return (
    <section className="grid gap-4">
      <header className="panel flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("modules.eyebrow")}</p>
          <h2 className="font-display text-2xl">{t("modules.title")}</h2>
        </div>
        <Wrench className="h-6 w-6 text-accent-sky" />
      </header>

      <article className="depth-panel rounded-[22px] border border-white/12 p-4">
        <h3 className="mb-3 text-sm uppercase tracking-[0.16em] text-ink-soft">{t("modules.flow")}</h3>
        <div className="overflow-hidden rounded-xl border border-white/12 bg-black/25 p-4">
          <svg viewBox="0 0 100 100" className="h-[300px] w-full">
            <defs>
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(122,208,255,0.45)" />
                <stop offset="100%" stopColor="rgba(122,208,255,0)" />
              </radialGradient>
            </defs>

            <rect x={3} y={3} width={94} height={94} rx={8} className="fill-none stroke-white/14 stroke-[0.6]" />
            <circle cx={50} cy={52} r={26} fill="url(#coreGlow)" />
            <path d="M50 18L20 38L20 67L50 84L80 67L80 38Z" className="fill-none stroke-white/18 stroke-[0.8]" />

            {topologyEdges.map((edge) => {
              const fromModule = moduleMap.get(edge.from);
              const toModule = moduleMap.get(edge.to);
              const active = Boolean(fromModule?.isOnline && toModule?.isOnline);
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={edge.path}
                  className={`power-link ${active ? "power-link--active" : "power-link--idle"}`}
                />
              );
            })}

            {topologyNodes.map((node) => {
              const module = moduleMap.get(node.type);
              const online = module?.isOnline ?? false;
              const health = module?.health ?? 0;
              const ring = online ? "stroke-accent-sky/65" : "stroke-white/25";
              return (
                <g key={node.type} transform={`translate(${node.x},${node.y})`}>
                  <circle cx={0} cy={0} r={10.2} className="fill-black/70 stroke-white/15 stroke-[1.2]" />
                  <circle cx={0} cy={0} r={8.8} className={`fill-black/60 ${ring} stroke-[1.5]`} />
                  <circle
                    cx={0}
                    cy={0}
                    r={5.2}
                    className={
                      health < 35
                        ? "power-pulse fill-accent-red/75"
                        : health < 65
                          ? "power-pulse fill-accent-amber/75"
                          : "power-pulse fill-accent-teal/75"
                    }
                  />
                  <text x={0} y={-11.5} className="fill-white/75 text-[3.2px] tracking-[0.2em]" textAnchor="middle">
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
          </div>
        </div>
      </article>

      <div className="grid gap-3">
        {station.modules.map((module) => {
          const loading = upgradeMutation.isPending || repairMutation.isPending || toggleMutation.isPending;
          return (
            <article
              key={module.id}
              className="group rounded-2xl border border-white/12 bg-[linear-gradient(110deg,rgba(10,18,30,0.82),rgba(7,13,23,0.9))] p-3 transition hover:border-accent-sky/45 hover:bg-[linear-gradient(110deg,rgba(10,22,36,0.9),rgba(7,13,23,0.92))]"
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

                <div className="flex flex-wrap gap-2">
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
                    className="rounded-lg border border-accent-sky/50 px-3 py-1.5 text-xs text-accent-sky transition hover:bg-accent-sky/10 disabled:opacity-60"
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
                    className="rounded-lg border border-accent-teal/50 px-3 py-1.5 text-xs text-accent-teal transition hover:bg-accent-teal/10 disabled:opacity-60"
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
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-ink-normal transition hover:bg-white/10 disabled:opacity-60"
                  >
                    {module.isOnline ? t("modules.disable") : t("modules.enable")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {error ? <p className="text-sm text-accent-red">{getErrorMessage(error)}</p> : null}
    </section>
  );
}
