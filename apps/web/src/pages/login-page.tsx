import { useState, type FormEvent } from "react";
import { ChevronUp, Eye, EyeOff, Languages } from "lucide-react";
import { SpaceSceneBackdrop } from "../components/space-scene-backdrop";
import { useDemoMutation, useLoginMutation, useRegisterMutation } from "../hooks/use-auth";
import { useI18n } from "../i18n/i18n-provider";
import { getErrorMessage } from "../lib/errors";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consoleHidden, setConsoleHidden] = useState(false);

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const demoMutation = useDemoMutation();
  const { locale, setLocale, t } = useI18n();

  const isBusy = loginMutation.isPending || registerMutation.isPending || demoMutation.isPending;

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    try {
      if (mode === "login") {
        await loginMutation.mutateAsync({ email, password });
      } else {
        await registerMutation.mutateAsync({ name, email, password });
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function runDemo() {
    setErrorMessage(null);
    try {
      await demoMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <main className="login-cinematic relative min-h-screen overflow-hidden">
      <SpaceSceneBackdrop sceneId="entry" showLabel />

      <div className="entry-grid-overlay pointer-events-none absolute inset-0" />
      <div className="entry-sunline pointer-events-none absolute inset-x-0 top-[42%] h-px" />

      {consoleHidden ? (
        <button
          type="button"
          onClick={() => setConsoleHidden(false)}
          className="login-reveal-button fixed bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/45 px-4 py-2 text-sm text-ink-strong backdrop-blur-md transition hover:border-accent-sky/60"
        >
          <Eye className="h-4 w-4" />
          {t("auth.showConsole")}
        </button>
      ) : null}

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-8 lg:justify-end">
        {!consoleHidden ? (
          <article className="login-panel w-full max-w-[24rem] rounded-[24px] border border-white/22 bg-[linear-gradient(180deg,rgba(9,19,33,0.55),rgba(6,12,22,0.86))] p-5 shadow-[0_28px_90px_rgba(2,6,14,0.68)] backdrop-blur-xl transition-all duration-300 sm:p-6">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-soft">{t("auth.viewportEyebrow")}</p>
              <h1 className="mt-1 font-display text-[1.95rem] leading-[1.06] text-ink-strong">{t("auth.viewportTitle")}</h1>
              <p className="mt-2 text-sm text-ink-normal">{t("auth.viewportBody")}</p>
            </div>

            <div className="grid justify-items-end gap-2">
              <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                <Languages className="h-3.5 w-3.5" />
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en-US")}
                  className="rounded-md border border-white/20 bg-black/35 px-2 py-1 text-xs text-ink-normal outline-none"
                >
                  <option value="en-US">{t("common.enUS")}</option>
                  <option value="pt-BR">{t("common.ptBR")}</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setConsoleHidden(true)}
                className="inline-flex items-center gap-1 rounded-md border border-white/18 bg-black/28 px-2 py-1 text-[11px] text-ink-soft transition hover:text-ink-strong"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {t("auth.hideConsole")}
              </button>
            </div>
          </header>

          <div className="entry-handshake mb-4 rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            {t("auth.viewportTagline")}
          </div>

          <div className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-black/28 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
                mode === "login" ? "bg-accent-sky/20 text-ink-strong" : "text-ink-soft hover:text-ink-normal"
              }`}
            >
              {t("auth.formLogin")}
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
                mode === "register" ? "bg-accent-teal/20 text-ink-strong" : "text-ink-soft hover:text-ink-normal"
              }`}
            >
              {t("auth.formRegister")}
            </button>
          </div>

          <form className="grid gap-3.5" onSubmit={submitForm}>
            {mode === "register" ? (
              <label className="grid gap-1 text-sm text-ink-normal">
                {t("auth.name")}
                <input
                  required
                  minLength={3}
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-xl border border-white/15 bg-black/26 px-3 py-2 outline-none transition focus:border-accent-sky"
                />
              </label>
            ) : null}

            <label className="grid gap-1 text-sm text-ink-normal">
              {t("auth.email")}
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-white/15 bg-black/26 px-3 py-2 outline-none transition focus:border-accent-sky"
              />
            </label>

            <label className="grid gap-1 text-sm text-ink-normal">
              {t("auth.password")}
              <input
                required
                type="password"
                value={password}
                minLength={mode === "register" ? 12 : 1}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-white/15 bg-black/26 px-3 py-2 outline-none transition focus:border-accent-sky"
              />
            </label>

            <button
              disabled={isBusy}
              type="submit"
              className="mt-1 rounded-xl border border-accent-sky/55 bg-accent-sky/18 px-4 py-2.5 font-semibold text-ink-strong transition hover:bg-accent-sky/24 disabled:opacity-60"
            >
              {mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
            </button>

            <button
              disabled={isBusy}
              type="button"
              onClick={runDemo}
              className="rounded-xl border border-accent-amber/50 bg-accent-amber/[0.08] px-4 py-2.5 text-sm text-accent-amber transition hover:bg-accent-amber/[0.14] disabled:opacity-60"
            >
              {t("auth.demo")}
            </button>

            {errorMessage ? <p className="text-sm text-accent-red">{errorMessage}</p> : null}
          </form>

          <button
            type="button"
            onClick={() => setConsoleHidden(true)}
            className="mt-4 inline-flex items-center gap-1 text-xs text-ink-soft transition hover:text-ink-normal"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            {t("auth.hideConsole")}
          </button>
          </article>
        ) : null}
      </section>
    </main>
  );
}
