import { Orbit } from "lucide-react";
import { SpaceSceneBackdrop } from "../components/space-scene-backdrop";
import { useDemoMutation } from "../hooks/use-auth";
import { useI18n } from "../i18n/i18n-provider";
import { getErrorMessage } from "../lib/errors";

export function DemoEntryPage() {
  const demoMutation = useDemoMutation();
  const { t } = useI18n();

  return (
    <main className="login-cinematic relative min-h-screen overflow-hidden">
      <SpaceSceneBackdrop sceneId="entry" showLabel />
      <section className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
        <article className="login-panel w-full max-w-xl rounded-[26px] border border-white/18 bg-[linear-gradient(180deg,rgba(10,20,34,0.6),rgba(8,14,25,0.9))] p-6 text-center shadow-[0_28px_84px_rgba(2,6,14,0.66)]">
          <Orbit className="mx-auto h-8 w-8 text-accent-amber" />
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink-soft">{t("demo.eyebrow")}</p>
          <h1 className="mt-2 font-display text-3xl text-ink-strong">{t("demo.title")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-ink-normal">{t("demo.body")}</p>

          <button
            type="button"
            disabled={demoMutation.isPending}
            onClick={async () => {
              await demoMutation.mutateAsync().catch(() => undefined);
            }}
            className="mt-6 rounded-full border border-accent-amber/60 bg-accent-amber/[0.08] px-4 py-2.5 text-sm text-accent-amber transition hover:bg-accent-amber/[0.14] disabled:opacity-60"
          >
            {t("demo.cta")}
          </button>

          {demoMutation.error ? <p className="mt-3 text-sm text-accent-red">{getErrorMessage(demoMutation.error)}</p> : null}
        </article>
      </section>
    </main>
  );
}
