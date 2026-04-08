import type { StationState } from "@orbital/shared";
import { BatteryCharging, BrainCircuit, Coins, Droplets, HeartPulse, Shield, Utensils, Wind } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import { resourceLabel } from "../lib/game-labels";

const resources: Array<keyof StationState["resources"]> = [
  "energy",
  "oxygen",
  "water",
  "food",
  "credits",
  "research",
  "hullIntegrity",
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
    <section className="resource-ribbon rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(8,17,30,0.78),rgba(6,13,24,0.92))] px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resources.map((resource) => {
          const rawValue = snapshot[resource] ?? 0;
          const percent = getValuePercent(resource, rawValue);
          const Icon = iconMap[resource];
          return (
            <article key={resource} className="hud-resource signal-meter px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ink-soft">{resourceLabel(t, resource)}</p>
                <Icon className={cn("h-4 w-4", tone(percent))} />
              </div>
              <p className={cn("mt-1 font-mono text-lg", tone(percent))}>
                {resource === "credits" || resource === "research" ? formatNumber(rawValue, 0) : formatNumber(rawValue, 1)}
              </p>
              <p className={cn("mt-0.5 text-[11px] uppercase tracking-[0.12em]", tone(percent))}>
                {t(statusKey(percent))} | {formatNumber(percent, 0)}%
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.06]">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", barTone(percent))}
                  style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

