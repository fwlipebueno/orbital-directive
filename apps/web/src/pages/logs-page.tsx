import type { StationState } from "@orbital/shared";
import { ActivitySquare } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { useStationLogs } from "../hooks/use-station";
import { formatRelativeDate } from "../lib/format";
import { localizeLogType, localizeMissionLogMessage } from "../lib/mission-log-copy";

function logTone(type: string): string {
  switch (type) {
    case "incident":
      return "border-accent-amber/35 bg-accent-amber/8";
    case "audit":
      return "border-accent-sky/35 bg-accent-sky/8";
    default:
      return "border-white/12 bg-white/[0.02]";
  }
}

export function LogsPage({ station }: { station: StationState }) {
  const logsQuery = useStationLogs(station.stationId);
  const { t, locale } = useI18n();

  return (
    <section className="grid gap-4">
      <header className="depth-panel rounded-[22px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("logs.eyebrow")}</p>
            <h2 className="mt-1 font-display text-2xl text-ink-strong">{t("logs.title")}</h2>
          </div>
          <ActivitySquare className="h-6 w-6 text-accent-teal" />
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-normal">{t("logs.intro")}</p>
      </header>

      <article className="depth-panel rounded-[22px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        {logsQuery.isLoading ? (
          <p className="text-sm text-ink-soft">{t("logs.loading")}</p>
        ) : logsQuery.data && logsQuery.data.length > 0 ? (
          <ul className="mission-feed timeline-feed grid gap-3">
            {logsQuery.data.map((log) => (
              <li key={log.id} className={`rounded-xl border px-4 py-3 ${logTone(log.type)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{localizeLogType(log.type, t)}</p>
                  <p className="font-mono text-[11px] text-ink-soft">{formatRelativeDate(log.createdAt)}</p>
                </div>
                <p className="mt-2 text-sm text-ink-strong">{localizeMissionLogMessage(log.message, t, locale)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">{t("logs.empty")}</p>
        )}
      </article>
    </section>
  );
}
