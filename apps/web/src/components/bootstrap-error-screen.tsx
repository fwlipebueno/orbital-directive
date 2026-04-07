import { RefreshCcw, ServerCrash } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";

type BootstrapErrorScreenProps = {
  title: string;
  message: string;
  details?: string;
  retryLabel?: string;
  onRetry: () => void | Promise<void>;
};

export function BootstrapErrorScreen({
  title,
  message,
  details,
  retryLabel,
  onRetry
}: BootstrapErrorScreenProps) {
  const { t } = useI18n();

  return (
    <main className="command-grid relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-ink-normal">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,127,127,0.14),transparent_44%)]" />

      <section className="panel relative w-full max-w-2xl rounded-[26px] p-7 text-center lg:p-9">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-accent-red/35 bg-accent-red/10">
          <ServerCrash className="h-7 w-7 text-accent-red" />
        </div>

        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("common.productName")}</p>
        <h1 className="mt-2 font-display text-2xl text-ink-strong">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-normal">{message}</p>

        {details ? (
          <p className="mx-auto mt-4 max-w-xl rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-ink-soft">
            {details}
          </p>
        ) : null}

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              void onRetry();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-accent-sky/50 px-4 py-2 text-sm text-accent-sky transition hover:bg-accent-sky/10"
          >
            <RefreshCcw className="h-4 w-4" />
            {retryLabel ?? t("common.retry")}
          </button>
        </div>
      </section>
    </main>
  );
}
