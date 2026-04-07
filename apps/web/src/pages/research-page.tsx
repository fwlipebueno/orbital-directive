import type { StationState } from "@orbital/shared";
import { FlaskConical } from "lucide-react";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import { useResearchList, useResearchPurchaseMutation } from "../hooks/use-station";
import { getErrorMessage } from "../lib/errors";
import { formatNumber } from "../lib/format";
import { newIdempotencyKey } from "../lib/idempotency";

export function ResearchPage({ station }: { station: StationState }) {
  const researchQuery = useResearchList(station.stationId);
  const purchaseMutation = useResearchPurchaseMutation();
  const audio = useAudio();
  const researchPoints = station.resources.research ?? 0;
  const { t } = useI18n();

  if (researchQuery.isLoading) {
    return <section className="panel text-sm text-ink-soft">{t("research.loading")}</section>;
  }

  const entries = researchQuery.data ?? [];

  return (
    <section className="grid gap-4">
      <header className="depth-panel flex items-center justify-between rounded-[24px] border border-white/16 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("research.eyebrow")}</p>
          <h2 className="font-display text-2xl">{t("research.title")}</h2>
          <p className="mt-1 text-sm text-ink-normal">
            {t("research.available")}: {formatNumber(researchPoints, 1)}
          </p>
        </div>
        <FlaskConical className="h-6 w-6 text-accent-teal" />
      </header>

      {entries.length === 0 ? (
        <article className="panel text-sm text-ink-soft">{t("research.matrixEmpty")}</article>
      ) : (
        <article className="depth-panel overflow-hidden rounded-[24px] border border-white/14 p-4">
          <div className="research-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="rounded-[18px] border border-white/14 bg-[linear-gradient(180deg,rgba(11,20,34,0.78),rgba(8,14,24,0.92))] p-3"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{entry.key}</p>
                <h3 className="mt-1 font-display text-lg text-ink-strong">{entry.label}</h3>
                <p className="mt-2 text-xs text-ink-normal">{entry.description}</p>

                <div className="mt-3 text-xs text-ink-soft">
                  <p>
                    {t("research.level")}: {entry.level}/{entry.maxLevel}
                  </p>
                  <p>
                    {t("research.nextCost")}:{" "}
                    {entry.nextCost === null ? t("research.max") : formatNumber(entry.nextCost, 0)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={entry.nextCost === null || purchaseMutation.isPending}
                  onClick={async () => {
                    try {
                      await purchaseMutation.mutateAsync({
                        stationId: station.stationId,
                        upgradeKey: entry.key,
                        idempotencyKey: newIdempotencyKey()
                      });
                      audio.playEffect("success");
                    } catch {
                      audio.playEffect("error");
                    }
                  }}
                  className="mt-3 rounded-full border border-accent-teal/50 px-3 py-1.5 text-xs text-accent-teal transition hover:bg-accent-teal/10 disabled:opacity-60"
                >
                  {t("research.purchase")}
                </button>
              </div>
            ))}
          </div>
        </article>
      )}

      {purchaseMutation.error ? <p className="text-sm text-accent-red">{getErrorMessage(purchaseMutation.error)}</p> : null}
    </section>
  );
}
