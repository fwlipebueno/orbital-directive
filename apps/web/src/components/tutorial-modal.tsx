import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
}

export function TutorialModal({ open, onClose }: TutorialModalProps) {
  const { t } = useI18n();
  const audio = useAudio();
  const [index, setIndex] = useState(0);

  const steps = useMemo(
    () => [
      {
        title: t("tutorial.step1.title"),
        body: t("tutorial.step1.body")
      },
      {
        title: t("tutorial.step2.title"),
        body: t("tutorial.step2.body")
      },
      {
        title: t("tutorial.step3.title"),
        body: t("tutorial.step3.body")
      },
      {
        title: t("tutorial.step4.title"),
        body: t("tutorial.step4.body")
      },
      {
        title: t("tutorial.step5.title"),
        body: t("tutorial.step5.body")
      }
    ],
    [t]
  );

  if (!open) {
    return null;
  }

  const step = steps[index] ?? steps[0];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  if (!step) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <section className="w-full max-w-2xl rounded-[26px] border border-white/20 bg-[linear-gradient(180deg,rgba(8,18,31,0.92),rgba(6,12,22,0.97))] p-5 shadow-[0_30px_80px_rgba(1,5,12,0.75)] sm:p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">{t("tutorial.eyebrow")}</p>
            <h2 className="mt-1 font-display text-2xl text-ink-strong">{t("tutorial.title")}</h2>
            <p className="mt-2 text-sm text-ink-normal">{t("tutorial.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              audio.playEffect("click");
              onClose();
            }}
            className="rounded-lg border border-white/20 p-2 text-ink-soft transition hover:text-ink-strong"
            aria-label={t("tutorial.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mb-3 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-sky/80 via-accent-teal/80 to-accent-sky/80"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>

        <article className="rounded-[18px] border border-white/12 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">
            {t("tutorial.step")} {index + 1}/{steps.length}
          </p>
          <h3 className="mt-2 font-display text-xl text-ink-strong">{step.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-normal">{step.body}</p>
        </article>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              audio.playEffect("tutorial");
              setIndex((current) => Math.max(0, current - 1));
            }}
            disabled={isFirst}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-ink-normal transition hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("tutorial.previous")}
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => {
                audio.playEffect("confirm");
                onClose();
              }}
              className="rounded-xl border border-accent-teal/60 bg-accent-teal/10 px-4 py-2 text-sm font-medium text-accent-teal transition hover:bg-accent-teal/18"
            >
              {t("tutorial.finish")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                audio.playEffect("tutorial");
                setIndex((current) => Math.min(steps.length - 1, current + 1));
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-accent-sky/60 bg-accent-sky/10 px-4 py-2 text-sm font-medium text-accent-sky transition hover:bg-accent-sky/18"
            >
              {t("tutorial.next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
