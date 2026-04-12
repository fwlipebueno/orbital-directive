import type { StationState } from "@orbital/shared";
import { BatteryCharging, BrainCircuit, Coins, Droplets, HeartPulse, Shield, Utensils, Wind } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import { resourceLabel } from "../lib/game-labels";

const primaryResources: Array<keyof StationState["resources"]> = [
  "energy",
  "oxygen",
  "water",
  "food",
  "hullIntegrity"
];

const supportResources: Array<keyof StationState["resources"]> = [
  "credits",
  "research",
  "morale"
];

const iconMap = {
  energy: BatteryCharging,
  oxygen: Wind,
  water: Droplets,
  food: Utensils,
  credits: Coins,
  research: BrainCircuit,
  hullIntegrity: Shield,
  morale: HeartPulse
} as const;

function getValuePercent(resource: keyof StationState["resources"], value: number): number {
  if (resource === "credits" || resource === "research") {
    return Math.min(100, (value / 2400) * 100);
  }
  return Math.max(0, Math.min(100, value));
}

function tone(percent: number): string {
  if (percent < 25) {
    return "text-accent-red";
  }
  if (percent < 50) {
    return "text-accent-amber";
  }
  if (percent < 70) {
    return "text-accent-sky";
  }
  return "text-accent-teal";
}

function barTone(percent: number): string {
  if (percent < 25) {
    return "from-accent-red/85 to-accent-red/40";
  }
  if (percent < 50) {
    return "from-accent-amber/85 to-accent-amber/40";
  }
  if (percent < 70) {
    return "from-accent-sky/85 to-accent-sky/40";
  }
  return "from-accent-teal/85 to-accent-teal/40";
}

function statusKey(percent: number): "resource.status.critical" | "resource.status.warning" | "resource.status.watch" | "resource.status.stable" {
  if (percent < 25) {
    return "resource.status.critical";
  }
  if (percent < 50) {
    return "resource.status.warning";
  }
  if (percent < 70) {
    return "resource.status.watch";
  }
  return "resource.status.stable";
}

export function ResourceStrip({ resources: snapshot }: { resources: StationState["resources"] }) {
  const { t } = useI18n();

  return (
    <section className="resource-ribbon hud-frame hud-frame--corners rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(8,17,30,0.78),rgba(6,13,24,0.92))] px-3 py-3">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("resource.ribbonTitle")}</p>
        <p className="text-[11px] text-ink-soft">{t("resource.ribbonHint")}</p>
      </header>
      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {primaryResources.map((resource) => {
            const rawValue = snapshot[resource] ?? 0;
            const percent = getValuePercent(resource, rawValue);
            const Icon = iconMap[resource];
            return (
              <article key={resource} className="resource-cell hud-frame signal-meter px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">{resourceLabel(t, resource)}</p>
                  <Icon className={cn("h-4 w-4", tone(percent))} />
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className={cn("font-mono text-lg", tone(percent))}>{formatNumber(rawValue, 1)}</p>
                  <p className={cn("text-[11px] uppercase tracking-[0.12em]", tone(percent))}>{formatNumber(percent, 0)}%</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.06]">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", barTone(percent))}
                    style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                  />
                </div>
                <p className={cn("mt-1 text-[10px] uppercase tracking-[0.12em]", tone(percent))}>{t(statusKey(percent))}</p>
              </article>
            );
          })}
        </div>

        <div className="resource-support-grid grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {supportResources.map((resource) => {
            const rawValue = snapshot[resource] ?? 0;
            const percent = getValuePercent(resource, rawValue);
            const Icon = iconMap[resource];
            const isDiscrete = resource === "credits" || resource === "research";
            return (
              <article key={resource} className="resource-support-pill hud-frame rounded-xl border border-white/12 bg-black/24 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{resourceLabel(t, resource)}</p>
                  <Icon className={cn("h-3.5 w-3.5", tone(percent))} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className={cn("font-mono text-sm", tone(percent))}>
                    {isDiscrete ? formatNumber(rawValue, 0) : formatNumber(rawValue, 1)}
                  </p>
                  <p className={cn("text-[10px] uppercase tracking-[0.12em]", tone(percent))}>
                    {isDiscrete ? t(statusKey(percent)) : `${formatNumber(percent, 0)}%`}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

