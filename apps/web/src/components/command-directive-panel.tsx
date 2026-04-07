import { useEffect, useState } from "react";
import type { StationState } from "@orbital/shared";
import { Flame, ShieldPlus, SlidersHorizontal, Zap } from "lucide-react";
import { useI18n } from "../i18n/i18n-provider";
import { formatNumber } from "../lib/format";

type CommandDirectivePanelProps = {
  state: StationState["commandState"];
  onUpdateState: (next: {
    powerProfile: StationState["commandState"]["powerProfile"];
    subsystemFocus: StationState["commandState"]["subsystemFocus"];
    thermalPolicy: StationState["commandState"]["thermalPolicy"];
  }) => Promise<void>;
  onOrbitalBurn: () => Promise<void>;
  onDeployReserve: () => Promise<void>;
  isUpdating: boolean;
  isBurning: boolean;
  isReservePending: boolean;
};

const powerProfileKeys: StationState["commandState"]["powerProfile"][] = ["balanced", "lifeSupport", "research", "shielded"];
const subsystemFocusKeys: StationState["commandState"]["subsystemFocus"][] = ["balanced", "integrity", "research", "morale"];
const thermalPolicyKeys: StationState["commandState"]["thermalPolicy"][] = ["nominal", "economy", "boost"];

function OptionChip({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs transition ${
        active
          ? "border-accent-sky/70 bg-accent-sky/20 text-ink-strong shadow-[0_0_20px_rgba(122,208,255,0.15)]"
          : "border-white/16 bg-black/16 text-ink-soft hover:border-accent-sky/35 hover:text-ink-normal"
      }`}
    >
      {label}
    </button>
  );
}

export function CommandDirectivePanel({
  state,
  onUpdateState,
  onOrbitalBurn,
  onDeployReserve,
  isUpdating,
  isBurning,
  isReservePending
}: CommandDirectivePanelProps) {
  const { t } = useI18n();
  const [powerProfile, setPowerProfile] = useState(state.powerProfile);
  const [subsystemFocus, setSubsystemFocus] = useState(state.subsystemFocus);
  const [thermalPolicy, setThermalPolicy] = useState(state.thermalPolicy);

  useEffect(() => {
    setPowerProfile(state.powerProfile);
    setSubsystemFocus(state.subsystemFocus);
    setThermalPolicy(state.thermalPolicy);
  }, [state.powerProfile, state.subsystemFocus, state.thermalPolicy]);

  const changed =
    powerProfile !== state.powerProfile || subsystemFocus !== state.subsystemFocus || thermalPolicy !== state.thermalPolicy;

  return (
    <section className="command-console grid gap-4 rounded-[22px] border border-white/15 bg-[linear-gradient(180deg,rgba(11,21,36,0.86),rgba(8,15,27,0.95))] p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.17em] text-ink-soft">{t("dashboard.command.eyebrow")}</p>
          <h3 className="mt-1 font-display text-xl text-ink-strong">{t("dashboard.command.title")}</h3>
        </div>
        <SlidersHorizontal className="h-5 w-5 text-accent-sky" />
      </header>

      <div className="grid gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/16 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.powerProfile")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {powerProfileKeys.map((key) => (
              <OptionChip
                key={key}
                active={powerProfile === key}
                label={t(`command.powerProfile.${key}`)}
                onClick={() => setPowerProfile(key)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/16 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.subsystemFocus")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {subsystemFocusKeys.map((key) => (
              <OptionChip
                key={key}
                active={subsystemFocus === key}
                label={t(`command.subsystemFocus.${key}`)}
                onClick={() => setSubsystemFocus(key)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/16 p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.operationalPriority")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {thermalPolicyKeys.map((key) => (
              <OptionChip
                key={key}
                active={thermalPolicy === key}
                label={t(`command.thermalPolicy.${key}`)}
                onClick={() => setThermalPolicy(key)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <button
          type="button"
          disabled={!changed || isUpdating}
          onClick={() => {
            void onUpdateState({ powerProfile, subsystemFocus, thermalPolicy });
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-sky/55 bg-accent-sky/10 px-3 py-2 text-sm font-medium text-accent-sky transition hover:bg-accent-sky/16 disabled:opacity-45"
        >
          <Zap className="h-4 w-4" />
          {t("dashboard.command.applyProfile")}
        </button>

        <button
          type="button"
          disabled={!state.orbitalBurn.ready || isBurning}
          onClick={() => {
            void onOrbitalBurn();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-amber/55 bg-accent-amber/10 px-3 py-2 text-sm font-medium text-accent-amber transition hover:bg-accent-amber/16 disabled:opacity-45"
        >
          <Flame className="h-4 w-4" />
          {t("dashboard.command.orbitalBurn")}
        </button>

        <button
          type="button"
          disabled={!state.emergencyReserve.ready || isReservePending}
          onClick={() => {
            void onDeployReserve();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-teal/55 bg-accent-teal/10 px-3 py-2 text-sm font-medium text-accent-teal transition hover:bg-accent-teal/16 disabled:opacity-45"
        >
          <ShieldPlus className="h-4 w-4" />
          {t("dashboard.command.reserve")}
        </button>
      </div>

      <div className="grid gap-2 text-xs text-ink-soft md:grid-cols-2">
        <p>
          {t("dashboard.command.orbitalBurnCost")}: {formatNumber(state.orbitalBurn.energyCost, 0)} E /{" "}
          {formatNumber(state.orbitalBurn.creditsCost, 0)} C
        </p>
        <p>
          {t("dashboard.command.reserveCost")}: {formatNumber(state.emergencyReserve.creditsCost, 0)} C
        </p>
        <p>
          {t("dashboard.command.orbitalBurnCooldown")}:{" "}
          {state.orbitalBurn.ready ? t("dashboard.command.ready") : `${state.orbitalBurn.cooldownSecondsRemaining}s`}
        </p>
        <p>
          {t("dashboard.command.reserveCooldown")}:{" "}
          {state.emergencyReserve.ready
            ? t("dashboard.command.ready")
            : `${state.emergencyReserve.cooldownSecondsRemaining}s`}
        </p>
      </div>
    </section>
  );
}
