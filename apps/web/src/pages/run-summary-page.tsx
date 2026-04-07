import type { StationState } from "@orbital/shared";
import { BarChart3 } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { useRunSummaries } from "../hooks/use-station";
import { formatRelativeDate } from "../lib/format";
import { severityLabel } from "../lib/game-labels";

const knownSeverities: StationState["runSummary"]["severity"][] = ["normal", "attention", "alert", "crisis"];

function severityWeight(severity: StationState["runSummary"]["severity"]): number {
  switch (severity) {
    case "crisis":
      return 100;
    case "alert":
      return 76;
    case "attention":
      return 54;
    default:
      return 34;
  }
}

export function RunSummaryPage({ station }: { station: StationState }) {
  const summariesQuery = useRunSummaries(station.stationId);
  const { t } = useI18n();
  const rows = summariesQuery.data ?? [];
  const latest = rows[0];

  return (
    <section className="grid gap-4">
      <header className="depth-panel rounded-[22px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("run.eyebrow")}</p>
            <h2 className="mt-1 font-display text-2xl text-ink-strong">{t("run.title")}</h2>
          </div>
          <BarChart3 className="h-6 w-6 text-accent-sky" />
        </div>

        {latest ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/12 bg-black/22 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">{t("run.tick")}</p>
              <p className="mt-1 text-xl font-semibold text-ink-strong">{latest.tickSeconds}s</p>
            </div>
            <div className="rounded-xl border border-white/12 bg-black/22 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">{t("run.incidents")}</p>
              <p className="mt-1 text-xl font-semibold text-ink-strong">{latest.incidentCount}</p>
            </div>
            <div className="rounded-xl border border-white/12 bg-black/22 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">{t("run.severity")}</p>
              <p className="mt-1 text-xl font-semibold text-ink-strong">
                {severityLabel(t, knownSeverities.includes(latest.severity as StationState["runSummary"]["severity"]) ? (latest.severity as StationState["runSummary"]["severity"]) : "attention")}
              </p>
            </div>
          </div>
        ) : null}
      </header>

      <article className="depth-panel rounded-[22px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        {summariesQuery.isLoading ? (
          <p className="text-sm text-ink-soft">{t("run.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("run.empty")}</p>
        ) : (
          <ul className="grid gap-3">
            {rows.map((summary) => {
              const severity = knownSeverities.includes(summary.severity as StationState["runSummary"]["severity"])
                ? (summary.severity as StationState["runSummary"]["severity"])
                : "attention";
              const weight = severityWeight(severity);

              return (
                <li key={String(summary.id)} className="rounded-xl border border-white/12 bg-black/22 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-strong">
                      {t("run.tick")} {summary.tickSeconds}s | {t("run.incidents")} {summary.incidentCount}
                    </p>
                    <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">{formatRelativeDate(summary.createdAt)}</p>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-sky/65 via-accent-amber/70 to-accent-red/72"
                      style={{ width: `${weight}%` }}
                    />
                  </div>

                  <p className="mt-2 text-xs text-ink-soft">
                    {t("run.severity")} {severityLabel(t, severity)} | {t("run.critical")}:{" "}
                    {summary.criticalResources.join(", ") || t("run.none")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
