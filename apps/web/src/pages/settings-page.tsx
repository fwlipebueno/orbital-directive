import type { StationState } from "@orbital/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useUiPreferences } from "../app/ui-context";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { newIdempotencyKey } from "../lib/idempotency";
import { listSceneCredits } from "../lib/space-scenes";

interface SettingsPageProps {
  station: StationState;
}

export function SettingsPage({ station }: SettingsPageProps) {
  const queryClient = useQueryClient();
  const audio = useAudio();
  const { compactDensity, reducedSensoryMode, minimalNarrativeMode, setUiPreferences, setMinimalNarrativeMode } =
    useUiPreferences();
  const { t } = useI18n();

  const [resetConfirmation, setResetConfirmation] = useState("");

  const updatePreferencesMutation = useMutation({
    mutationFn: api.updatePreferences,
    onSuccess: async (payload) => {
      setUiPreferences({
        compactDensity: payload.compactDensity,
        reducedSensoryMode: payload.reducedSensoryMode
      });
      audio.updateSettings({ reducedSensoryMode: payload.reducedSensoryMode });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  const resetMutation = useMutation({
    mutationFn: (idempotencyKey: string) => api.resetStation(station.stationId, idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "runs"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });

  const canReset = useMemo(() => resetConfirmation.trim().toUpperCase() === "RESET", [resetConfirmation]);
  const sceneCredits = useMemo(() => listSceneCredits(), []);

  return (
    <section className="grid gap-4">
      <header className="depth-panel rounded-[24px] border border-white/16 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("settings.eyebrow")}</p>
            <h2 className="mt-1 font-display text-2xl text-ink-strong">{t("settings.title")}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t("settings.subtitle")}</p>
          </div>
          <Settings2 className="h-6 w-6 text-accent-sky" />
        </div>
      </header>

      <article className="depth-panel grid gap-4 rounded-[24px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)] lg:grid-cols-2">
        <div className="grid gap-3 rounded-[18px] border border-white/10 bg-black/18 p-4">
          <h3 className="font-display text-lg text-ink-strong">{t("settings.audio.title")}</h3>

          <label className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm text-ink-normal">
            {t("common.enableAudio")}
            <input
              type="checkbox"
              checked={audio.isAudioEnabled}
              onChange={async (event) => {
                await audio.setAudioEnabled(event.target.checked);
              }}
            />
          </label>

          <label className="grid gap-2 text-sm text-ink-normal">
            {t("settings.audio.music")} ({Math.round(audio.settings.musicVolume * 100)}%)
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audio.settings.musicVolume}
              onChange={(event) => audio.updateSettings({ musicVolume: Number(event.target.value) })}
            />
          </label>

          <label className="grid gap-2 text-sm text-ink-normal">
            {t("settings.audio.effects")} ({Math.round(audio.settings.effectsVolume * 100)}%)
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={audio.settings.effectsVolume}
              onChange={(event) => audio.updateSettings({ effectsVolume: Number(event.target.value) })}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm text-ink-normal">
            {t("settings.audio.mute")}
            <input
              type="checkbox"
              checked={audio.settings.muted}
              onChange={(event) => audio.updateSettings({ muted: event.target.checked })}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              audio.playEffect("hover");
              window.setTimeout(() => audio.playEffect("click"), 120);
              window.setTimeout(() => audio.playEffect("success"), 280);
            }}
            className="rounded-full border border-accent-sky/45 bg-accent-sky/10 px-3 py-1.5 text-sm text-accent-sky transition hover:bg-accent-sky/18"
          >
            {t("settings.audio.preview")}
          </button>

          <p className="text-xs text-ink-soft">{audio.isAudioReady ? t("settings.audio.ready") : t("settings.audio.pending")}</p>
        </div>

        <div className="grid gap-3 rounded-[18px] border border-white/10 bg-black/18 p-4">
          <h3 className="font-display text-lg text-ink-strong">{t("settings.visual.title")}</h3>

          <label className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm text-ink-normal">
            {t("settings.visual.reduced")}
            <input
              type="checkbox"
              checked={reducedSensoryMode}
              onChange={async (event) => {
                const next = event.target.checked;
                try {
                  await updatePreferencesMutation.mutateAsync({ reducedSensoryMode: next, compactDensity });
                } catch {
                  audio.playEffect("error");
                }
              }}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm text-ink-normal">
            {t("settings.visual.compact")}
            <input
              type="checkbox"
              checked={compactDensity}
              onChange={async (event) => {
                const next = event.target.checked;
                try {
                  await updatePreferencesMutation.mutateAsync({ reducedSensoryMode, compactDensity: next });
                } catch {
                  audio.playEffect("error");
                }
              }}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm text-ink-normal">
            {t("settings.visual.minimalNarrative")}
            <input
              type="checkbox"
              checked={minimalNarrativeMode}
              onChange={(event) => setMinimalNarrativeMode(event.target.checked)}
            />
          </label>

          {updatePreferencesMutation.error ? (
            <p className="text-sm text-accent-red">{getErrorMessage(updatePreferencesMutation.error)}</p>
          ) : null}
        </div>
      </article>

      <article className="depth-panel rounded-[24px] border border-accent-red/38 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <h3 className="font-display text-lg text-accent-red">{t("settings.reset.title")}</h3>
        <p className="mt-2 text-sm text-ink-normal">{t("settings.reset.body")}</p>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={resetConfirmation}
            onChange={(event) => setResetConfirmation(event.target.value)}
            placeholder={t("settings.reset.placeholder")}
            className="rounded-xl border border-accent-red/30 bg-black/20 px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={!canReset || resetMutation.isPending}
            onClick={async () => {
              try {
                await resetMutation.mutateAsync(newIdempotencyKey());
                setResetConfirmation("");
              } catch {
                audio.playEffect("error");
              }
            }}
            className="rounded-xl border border-accent-red/50 px-4 py-2 text-sm text-accent-red disabled:opacity-50"
          >
            {t("settings.reset.action")}
          </button>
        </div>

        {resetMutation.error ? <p className="mt-2 text-sm text-accent-red">{getErrorMessage(resetMutation.error)}</p> : null}
      </article>

      <article className="depth-panel rounded-[24px] border border-white/14 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <h3 className="font-display text-lg text-ink-strong">{t("settings.credits.title")}</h3>
        <p className="mt-2 text-sm text-ink-normal">{t("settings.credits.body")}</p>

        <ul className="mt-4 grid gap-3">
          {sceneCredits.map((credit) => (
            <li key={credit.sourceUrl} className="rounded-[18px] border border-white/12 bg-black/20 p-3">
              <p className="text-sm text-ink-strong">{credit.label}</p>
              <p className="mt-1 text-xs text-ink-soft">{credit.author}</p>
              <p className="text-xs text-ink-soft">{credit.license}</p>
              <a
                href={credit.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-accent-sky hover:underline"
              >
                {t("settings.credits.source")}
              </a>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
