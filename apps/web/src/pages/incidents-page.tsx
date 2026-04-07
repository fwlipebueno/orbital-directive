import type { StationState } from "@orbital/shared";
import { AlertCircle, Siren } from "lucide-react";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import { useResolveIncidentMutation } from "../hooks/use-station";
import { getErrorMessage } from "../lib/errors";
import { formatRelativeDate } from "../lib/format";
import { newIdempotencyKey } from "../lib/idempotency";
import { incidentLabel } from "../lib/game-labels";

export function IncidentsPage({ station }: { station: StationState }) {
  const resolveMutation = useResolveIncidentMutation();
  const audio = useAudio();
  const { t } = useI18n();

  const openIncidents = station.incidents.filter((incident) => incident.status === "open");

  return (
    <section className="grid gap-4">
      <header className="panel flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("incidents.eyebrow")}</p>
          <h2 className="font-display text-2xl">{t("incidents.title")}</h2>
        </div>
        <AlertCircle className="h-6 w-6 text-accent-amber" />
      </header>

      <article className="incident-hub rounded-[22px] border border-white/14 bg-[linear-gradient(180deg,rgba(10,18,31,0.74),rgba(7,13,23,0.9))] p-4">
        {openIncidents.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-ink-normal">{t("incidents.stable")}</div>
        ) : (
          <div className="grid gap-3">
            {openIncidents.map((incident) => (
              <article
                key={incident.id}
                className="rounded-xl border border-accent-amber/30 bg-[linear-gradient(180deg,rgba(44,33,18,0.3),rgba(19,14,8,0.3))] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg text-accent-amber">
                      <Siren className="mr-2 inline h-4 w-4" />
                      {incidentLabel(t, incident.type)}
                    </h3>
                    <p className="mt-1 text-xs text-ink-soft">
                      {t("incidents.severity")} {incident.severity} | {t("incidents.started")} {formatRelativeDate(incident.startedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={resolveMutation.isPending}
                    onClick={async () => {
                      try {
                        await resolveMutation.mutateAsync({
                          stationId: station.stationId,
                          incidentId: incident.id,
                          idempotencyKey: newIdempotencyKey()
                        });
                        audio.playEffect("incident");
                      } catch {
                        audio.playEffect("error");
                      }
                    }}
                    className="rounded-lg border border-accent-amber/60 px-3 py-1.5 text-xs text-accent-amber transition hover:bg-accent-amber/10 disabled:opacity-60"
                  >
                    {t("incidents.resolve")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      {resolveMutation.error ? <p className="text-sm text-accent-red">{getErrorMessage(resolveMutation.error)}</p> : null}
    </section>
  );
}
