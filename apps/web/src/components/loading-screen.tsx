import { LoaderCircle } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";

export function LoadingScreen({ label }: { label?: string }) {
  const { t } = useI18n();

  return (
    <main className="command-grid relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-ink-normal">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(122,208,255,0.15),transparent_38%)]" />

      <section className="panel relative w-full max-w-2xl overflow-hidden rounded-[26px] p-7 text-center lg:p-10">
        <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(68,201,179,0.2),transparent_70%)]" />

        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-sky/35 bg-white/[0.02]">
          <div className="relative h-10 w-10">
            <span className="absolute inset-0 rounded-full border border-accent-sky/35" />
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-teal shadow-[0_0_18px_rgba(68,201,179,0.65)]" />
            <LoaderCircle className="absolute inset-0 h-10 w-10 animate-spin text-accent-sky" />
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.22em] text-ink-soft">{t("common.productName")}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink-strong">{t("loading.commandLink")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-normal">{label ?? t("loading.establishing")}</p>

        <div className="mx-auto mt-6 h-1.5 w-full max-w-md overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-accent-sky/70 via-accent-teal/80 to-accent-sky/70" />
        </div>

        <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-ink-soft">{t("loading.handshake")}</p>
      </section>
    </main>
  );
}
