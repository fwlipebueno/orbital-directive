import type { StationState } from "@orbital/shared";
import { BrainCircuit, Shield, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAudio } from "../features/audio/audio-provider";
import { useResearchList, useResearchPurchaseMutation } from "../hooks/use-station";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { getErrorMessage } from "../lib/errors";
import { formatNumber } from "../lib/format";
import { newIdempotencyKey } from "../lib/idempotency";
import { getSceneDefinition } from "../lib/space-scenes";

const knownResearchKeys = ["efficiencyProtocol", "crewResilience", "shieldHarmonics"] as const;
type KnownResearchKey = (typeof knownResearchKeys)[number];

type LocalizedResearchEntry = {
  key: string;
  level: number;
  maxLevel: number;
  nextCost: number | null;
  knownKey: KnownResearchKey | null;
  label: string;
  description: string;
  impact: string;
  icon: typeof Sparkles;
};

function isKnownResearchKey(value: string): value is KnownResearchKey {
  return knownResearchKeys.includes(value as KnownResearchKey);
}

function resolvePriorityKey(station: StationState): KnownResearchKey {
  const hull = station.resources.hullIntegrity ?? 0;
  const morale = station.resources.morale ?? 0;

  if (station.runSummary.severity === "crisis" || station.openIncidentCount > 0 || hull < 62) {
    return "shieldHarmonics";
  }
  if (morale < 68) {
    return "crewResilience";
  }
  return "efficiencyProtocol";
}

export function ResearchPage({ station }: { station: StationState }) {
  const researchQuery = useResearchList(station.stationId);
  const purchaseMutation = useResearchPurchaseMutation();
  const audio = useAudio();
  const { t } = useI18n();
  const researchPoints = station.resources.research ?? 0;
  const priorityKey = resolvePriorityKey(station);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const researchScene = getSceneDefinition("research");

  const entries = useMemo<LocalizedResearchEntry[]>(() => {
    const rawEntries = researchQuery.data ?? [];
    return rawEntries.map((entry) => {
      const knownKey = isKnownResearchKey(entry.key) ? entry.key : null;
      const label = knownKey
        ? t(`research.upgrade.${knownKey}.label`)
        : t("research.upgrade.unknown.label", { key: entry.key });
      const description = knownKey
        ? t(`research.upgrade.${knownKey}.description`)
        : t("research.upgrade.unknown.description", { key: entry.key });
      const impact = knownKey ? t(`research.upgrade.${knownKey}.impact`) : t("research.upgrade.unknown.impact");
      const icon =
        knownKey === "shieldHarmonics"
          ? Shield
          : knownKey === "crewResilience"
            ? Users
            : knownKey === "efficiencyProtocol"
              ? BrainCircuit
              : Sparkles;

      return {
        key: entry.key,
        level: entry.level,
        maxLevel: entry.maxLevel,
        nextCost: entry.nextCost,
        knownKey,
        label,
        description,
        impact,
        icon
      };
    });
  }, [researchQuery.data, t]);

  const mastery = useMemo(() => {
    if (entries.length === 0) {
      return 0;
    }
    const totalCurrent = entries.reduce((acc, entry) => acc + entry.level, 0);
    const totalMax = entries.reduce((acc, entry) => acc + entry.maxLevel, 0);
    if (totalMax <= 0) {
      return 0;
    }
    return Math.round((totalCurrent / totalMax) * 100);
  }, [entries]);

  const priorityEntry =
    entries.find((entry) => entry.knownKey === priorityKey && entry.nextCost !== null) ??
    entries.find((entry) => entry.nextCost !== null) ??
    null;

  const allMaxed = entries.length > 0 && entries.every((entry) => entry.nextCost === null);

  const priorityReasonKey = allMaxed
    ? "research.priority.reason.maxed"
    : priorityEntry?.knownKey === "shieldHarmonics"
      ? "research.priority.reason.shield"
      : priorityEntry?.knownKey === "crewResilience"
        ? "research.priority.reason.crew"
        : "research.priority.reason.efficiency";

  const activeEntries = entries.filter((entry) => entry.nextCost !== null);
  const completedEntries = entries.filter((entry) => entry.nextCost === null);

  useEffect(() => {
    if (!entries.length) {
      setFocusedKey(null);
      return;
    }
    if (!focusedKey || !entries.some((entry) => entry.key === focusedKey)) {
      setFocusedKey(priorityEntry?.key ?? entries[0]?.key ?? null);
    }
  }, [entries, focusedKey, priorityEntry]);

  const focusedEntry =
    entries.find((entry) => entry.key === focusedKey) ?? priorityEntry ?? entries[0] ?? null;
  const focusProgress = focusedEntry ? Math.round((focusedEntry.level / focusedEntry.maxLevel) * 100) : 0;
  const focusEtaMinutes = focusedEntry?.nextCost ? Math.max(8, Math.round(focusedEntry.nextCost / 7)) : 0;

  async function purchaseUpgrade(upgradeKey: string) {
    try {
      await purchaseMutation.mutateAsync({
        stationId: station.stationId,
        upgradeKey,
        idempotencyKey: newIdempotencyKey()
      });
      audio.playEffect("tactical");
      window.setTimeout(() => audio.playEffect("confirm"), 120);
    } catch {
      audio.playEffect("error");
    }
  }

  if (researchQuery.isLoading) {
    return <section className="panel text-sm text-ink-soft">{t("research.loading")}</section>;
  }

  return (
    <section className="grid gap-4">
      <header className="depth-panel hud-frame hud-frame--corners flex items-center justify-between rounded-[24px] border border-white/16 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("research.eyebrow")}</p>
          <h2 className="font-display text-2xl text-ink-strong">{t("research.title")}</h2>
          <p className="mt-1 text-sm text-ink-normal">{t("research.subtitle")}</p>
        </div>

        <div className="grid gap-2 text-right">
          <p className="rounded-full border border-accent-teal/35 bg-accent-teal/10 px-3 py-1 text-xs text-accent-teal">
            {t("research.available")}: {formatNumber(researchPoints, 1)}
          </p>
          <p className="rounded-full border border-white/16 bg-black/24 px-3 py-1 text-xs text-ink-soft">
            {t("research.mastery")}: {mastery}%
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <article className="panel text-sm text-ink-soft">{t("research.matrixEmpty")}</article>
      ) : (
        <section className="research-command-shell grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <article className="research-lane-panel depth-panel hud-frame hud-frame--corners rounded-[24px] border border-white/14 p-4">
            <header className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("research.activeTitle")}</p>
              <h3 className="mt-1 font-display text-xl text-ink-strong">{t("research.activeSubtitle")}</h3>
              <p className="mt-1 text-xs text-ink-soft">{t(priorityReasonKey)}</p>
            </header>

            <div className="mb-3 rounded-xl border border-accent-sky/24 bg-accent-sky/[0.07] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-accent-sky">{t("research.objective.eyebrow")}</p>
              <p className="mt-1 text-sm text-ink-strong">{t("research.objective.title")}</p>
              <p className="mt-1 text-xs text-ink-soft">{t("research.objective.body")}</p>
            </div>

            <div className="grid gap-2">
              {activeEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onMouseEnter={() => audio.playEffect("hover")}
                  onClick={() => {
                    audio.playEffect("click");
                    setFocusedKey(entry.key);
                  }}
                  className={cn(
                    "research-track-entry rounded-xl border px-3 py-2 text-left transition",
                    focusedEntry?.key === entry.key
                      ? "border-accent-sky/55 bg-accent-sky/[0.1]"
                      : "border-white/14 bg-black/18 hover:border-accent-sky/35"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink-strong">{entry.label}</p>
                      <p className="text-[11px] text-ink-soft">
                        {t("research.level")}: {entry.level}/{entry.maxLevel}
                      </p>
                    </div>
                    <entry.icon className="h-4 w-4 text-accent-sky" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-teal/90 via-accent-sky/80 to-accent-amber/75"
                      style={{ width: `${Math.max(0, Math.min(100, (entry.level / entry.maxLevel) * 100))}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>

            {completedEntries.length > 0 ? (
              <div className="mt-3 rounded-xl border border-white/12 bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("research.completedTracks")}</p>
                <ul className="mt-2 grid gap-1.5">
                  {completedEntries.slice(0, 4).map((entry) => (
                    <li key={entry.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
                      <p className="text-xs text-ink-normal">{entry.label}</p>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-accent-teal">{t("research.priority.maxed")}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-white/12 bg-black/20 p-3 text-xs text-ink-soft">
              <p>
                {t("research.completedTracks")}: {completedEntries.length}
              </p>
              <p className="mt-1">
                {t("research.activeTracks")}: {activeEntries.length}
              </p>
              <p className="mt-1">{t("research.objective.body")}</p>
            </div>
          </article>

          {focusedEntry ? (
            <article className="research-focus-theater console-surface hud-frame hud-frame--corners hud-frame--glow overflow-hidden border border-accent-sky/28 p-0">
              <div className="research-focus-image relative h-44 w-full overflow-hidden border-b border-white/14 sm:h-52">
                <img src={researchScene.imageUrl} alt={researchScene.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,9,17,0.12),rgba(4,9,17,0.72))]" />
              </div>

              <div className="p-4">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex rounded-full border border-accent-teal/45 bg-accent-teal/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-accent-teal">
                      {t("research.priority.recommended")}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                      {t("research.trackCode", { key: focusedEntry.knownKey ?? focusedEntry.key })}
                    </p>
                    <h3 className="mt-2 font-display text-3xl leading-tight text-ink-strong">{focusedEntry.label}</h3>
                    <p className="mt-2 text-sm text-ink-normal">{focusedEntry.description}</p>
                  </div>
                  <focusedEntry.icon className="mt-1 h-5 w-5 text-accent-sky" />
                </header>

                <p className="mt-3 text-sm text-accent-sky">{focusedEntry.impact}</p>

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                    <p>{t("research.focusProgress")}</p>
                    <p>{focusProgress}%</p>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-teal/90 via-accent-sky/82 to-accent-amber/74"
                      style={{ width: `${Math.max(0, Math.min(100, focusProgress))}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/12 bg-black/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-ink-soft">{t("research.expectedImpact")}</p>
                    <p className="mt-1 text-sm text-accent-sky">{focusedEntry.impact}</p>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-black/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-ink-soft">{t("research.remainingTime")}</p>
                    <p className="mt-1 text-sm text-ink-normal">
                      {focusedEntry.nextCost === null ? t("research.priority.maxed") : `${focusEtaMinutes}min`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={focusedEntry.nextCost === null || purchaseMutation.isPending}
                    onMouseEnter={() => audio.playEffect("hover")}
                    onClick={() => {
                      void purchaseUpgrade(focusedEntry.key);
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-accent-teal/55 bg-accent-teal/12 px-4 py-2 text-sm text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-55"
                  >
                    {focusedEntry.nextCost === null ? t("research.priority.maxed") : t("research.priority.cta")}
                  </button>
                  <Link
                    to="/dashboard"
                    onMouseEnter={() => audio.playEffect("hover")}
                    onClick={() => audio.playEffect("click")}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-black/24 px-4 py-2 text-sm text-ink-normal transition hover:border-accent-sky/42 hover:text-ink-strong"
                  >
                    {t("research.backToCommand")}
                  </Link>
                </div>
              </div>
            </article>
          ) : null}
        </section>
      )}

      {purchaseMutation.error ? <p className="text-sm text-accent-red">{getErrorMessage(purchaseMutation.error)}</p> : null}
    </section>
  );
}
