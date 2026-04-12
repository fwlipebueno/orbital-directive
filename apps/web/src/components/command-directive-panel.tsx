import { useEffect, useState } from "react";
import type { StationState } from "@orbital/shared";
import { ChevronDown, Flame, ShieldPlus, SlidersHorizontal, Zap } from "lucide-react";
import { useAudio } from "../features/audio/audio-provider";
import { useI18n } from "../i18n/i18n-provider";
import { formatNumber } from "../lib/format";
import type { MissionPreset } from "../lib/mission-command-state";

type CommandDirectivePanelProps = {
  state: StationState["commandState"];
  onUpdateState: (next: MissionPreset) => Promise<void>;
  onOrbitalBurn: () => Promise<void>;
  onDeployReserve: () => Promise<void>;
  isUpdating: boolean;
  isBurning: boolean;
  isReservePending: boolean;
  recommendedProfile?: {
    labelKey: string;
    reasonKey: string;
    preset: MissionPreset;
  } | null;
};

const powerProfileKeys: StationState["commandState"]["powerProfile"][] = ["balanced", "lifeSupport", "research", "shielded"];
const subsystemFocusKeys: StationState["commandState"]["subsystemFocus"][] = ["balanced", "integrity", "research", "morale"];
const thermalPolicyKeys: StationState["commandState"]["thermalPolicy"][] = ["nominal", "economy", "boost"];

function OptionChip({
  active,
  recommended,
  label,
  onClick,
  onHover
}: {
  active: boolean;
  recommended?: boolean;
  label: string;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-2 text-xs transition",
        active
          ? "border-accent-sky/70 bg-accent-sky/20 text-ink-strong shadow-[0_0_20px_rgba(122,208,255,0.16)]"
          : recommended
            ? "border-accent-teal/45 bg-accent-teal/10 text-ink-normal hover:border-accent-teal/65"
            : "border-white/16 bg-black/20 text-ink-soft hover:border-accent-sky/35 hover:text-ink-normal"
      )}
    >
      {label}
    </button>
  );
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function CommandDirectivePanel({
  state,
  onUpdateState,
  onOrbitalBurn,
  onDeployReserve,
  isUpdating,
  isBurning,
  isReservePending,
  recommendedProfile
}: CommandDirectivePanelProps) {
  const { t } = useI18n();
  const audio = useAudio();
  const [powerProfile, setPowerProfile] = useState(state.powerProfile);
  const [subsystemFocus, setSubsystemFocus] = useState(state.subsystemFocus);
  const [thermalPolicy, setThermalPolicy] = useState(state.thermalPolicy);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    setPowerProfile(state.powerProfile);
    setSubsystemFocus(state.subsystemFocus);
    setThermalPolicy(state.thermalPolicy);
  }, [state.powerProfile, state.subsystemFocus, state.thermalPolicy]);

  const changed =
    powerProfile !== state.powerProfile || subsystemFocus !== state.subsystemFocus || thermalPolicy !== state.thermalPolicy;
  const postureSummary = `${t(`command.powerProfile.${powerProfile}`)} | ${t(`command.subsystemFocus.${subsystemFocus}`)} | ${t(
    `command.thermalPolicy.${thermalPolicy}`
  )}`;
  const quickProfiles: Array<{ id: string; preset: MissionPreset; tone: string }> = [
    {
      id: "containment",
      preset: { powerProfile: "shielded", subsystemFocus: "integrity", thermalPolicy: "nominal" },
      tone: "border-accent-amber/45 bg-accent-amber/10 text-accent-amber"
    },
    {
      id: "support",
      preset: { powerProfile: "lifeSupport", subsystemFocus: "morale", thermalPolicy: "economy" },
      tone: "border-accent-teal/45 bg-accent-teal/10 text-accent-teal"
    },
    {
      id: "research",
      preset: { powerProfile: "research", subsystemFocus: "research", thermalPolicy: "boost" },
      tone: "border-accent-sky/45 bg-accent-sky/10 text-accent-sky"
    }
  ];

  return (
    <section className="command-console hud-frame hud-frame--corners hud-frame--glow grid gap-4 rounded-[24px] border border-white/18 bg-[linear-gradient(180deg,rgba(8,18,32,0.84),rgba(5,11,21,0.96))] p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.17em] text-ink-soft">{t("dashboard.command.eyebrow")}</p>
          <h3 className="mt-1 font-display text-xl text-ink-strong">{t("dashboard.command.title")}</h3>
          <p className="mt-1 text-xs text-ink-soft">{t("dashboard.command.subtitle")}</p>
        </div>
        <SlidersHorizontal className="h-5 w-5 text-accent-sky" />
      </header>

      {recommendedProfile ? (
        <article className="hud-frame hud-frame--corners rounded-2xl border border-accent-teal/45 bg-accent-teal/[0.08] p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-accent-teal">{t("dashboard.command.recommended.eyebrow")}</p>
          <p className="mt-1 text-sm text-ink-strong">
            {t(recommendedProfile.labelKey)} | {t(recommendedProfile.reasonKey)}
          </p>
          <button
            type="button"
            disabled={isUpdating}
            onMouseEnter={() => audio.playEffect("hover")}
            onClick={() => {
              audio.playEffect("tactical");
              void onUpdateState(recommendedProfile.preset);
            }}
            className="mt-2 rounded-full border border-accent-teal/55 bg-accent-teal/12 px-3 py-1.5 text-xs text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-45"
          >
            {t("dashboard.command.recommended.apply")}
          </button>
        </article>
      ) : null}

      <article className="command-posture-deck hud-frame hud-frame--corners rounded-xl border border-white/12 bg-black/20 p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.currentPosture")}</p>
            <p className="mt-1 text-sm text-ink-normal">{postureSummary}</p>
          </div>
          <button
            type="button"
            onMouseEnter={() => audio.playEffect("hover")}
            onClick={() => {
              audio.playEffect("click");
              setManualOpen((previous) => !previous);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-[11px] text-ink-soft transition hover:border-accent-sky/45 hover:text-ink-normal"
          >
            {manualOpen ? t("dashboard.command.manualHide") : t("dashboard.command.manualShow")}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", manualOpen && "rotate-180")} />
          </button>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.quickTitle")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {quickProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={isUpdating}
              onMouseEnter={() => audio.playEffect("hover")}
              onClick={() => {
                audio.playEffect("tactical");
                void onUpdateState(profile.preset);
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-45",
                profile.tone
              )}
            >
              <p className="font-medium">{t(`command.powerProfile.${profile.preset.powerProfile}`)}</p>
              <p className="mt-1 text-[10px] opacity-90">
                {t(`command.subsystemFocus.${profile.preset.subsystemFocus}`)} | {t(`command.thermalPolicy.${profile.preset.thermalPolicy}`)}
              </p>
            </button>
          ))}
        </div>
      </article>

      {manualOpen ? (
        <div className="command-track hud-frame rounded-xl border border-white/12 bg-black/16 p-2 grid gap-2">
          <div className="command-track-row rounded-xl border border-white/12 bg-black/20 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.powerProfile")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {powerProfileKeys.map((key) => (
                <OptionChip
                  key={key}
                  active={powerProfile === key}
                  recommended={Boolean(recommendedProfile && recommendedProfile.preset.powerProfile === key)}
                  label={t(`command.powerProfile.${key}`)}
                  onHover={() => audio.playEffect("hover")}
                  onClick={() => {
                    audio.playEffect("click");
                    setPowerProfile(key);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="command-track-row rounded-xl border border-white/12 bg-black/20 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.subsystemFocus")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {subsystemFocusKeys.map((key) => (
                <OptionChip
                  key={key}
                  active={subsystemFocus === key}
                  recommended={Boolean(recommendedProfile && recommendedProfile.preset.subsystemFocus === key)}
                  label={t(`command.subsystemFocus.${key}`)}
                  onHover={() => audio.playEffect("hover")}
                  onClick={() => {
                    audio.playEffect("click");
                    setSubsystemFocus(key);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="command-track-row rounded-xl border border-white/12 bg-black/20 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-ink-soft">{t("dashboard.command.operationalPriority")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {thermalPolicyKeys.map((key) => (
                <OptionChip
                  key={key}
                  active={thermalPolicy === key}
                  recommended={Boolean(recommendedProfile && recommendedProfile.preset.thermalPolicy === key)}
                  label={t(`command.thermalPolicy.${key}`)}
                  onHover={() => audio.playEffect("hover")}
                  onClick={() => {
                    audio.playEffect("click");
                    setThermalPolicy(key);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="command-action-rail grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
        <button
          type="button"
          disabled={!changed || isUpdating}
          onMouseEnter={() => audio.playEffect("hover")}
          onClick={() => {
            audio.playEffect("tactical");
            void onUpdateState({ powerProfile, subsystemFocus, thermalPolicy });
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-sky/55 bg-accent-sky/12 px-3 py-2 text-sm font-medium text-accent-sky transition hover:bg-accent-sky/18 disabled:opacity-45"
        >
          <Zap className="h-4 w-4" />
          {t("dashboard.command.applyProfile")}
        </button>

        <button
          type="button"
          disabled={!state.orbitalBurn.ready || isBurning}
          onMouseEnter={() => audio.playEffect("hover")}
          onClick={() => {
            audio.playEffect("tactical");
            void onOrbitalBurn();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-amber/55 bg-accent-amber/12 px-3 py-2 text-sm font-medium text-accent-amber transition hover:bg-accent-amber/18 disabled:opacity-45"
        >
          <Flame className="h-4 w-4" />
          {t("dashboard.command.orbitalBurn")}
        </button>

        <button
          type="button"
          disabled={!state.emergencyReserve.ready || isReservePending}
          onMouseEnter={() => audio.playEffect("hover")}
          onClick={() => {
            audio.playEffect("tactical");
            void onDeployReserve();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-teal/55 bg-accent-teal/12 px-3 py-2 text-sm font-medium text-accent-teal transition hover:bg-accent-teal/18 disabled:opacity-45"
        >
          <ShieldPlus className="h-4 w-4" />
          {t("dashboard.command.reserve")}
        </button>
      </div>

      <div className="command-meta-grid grid gap-1.5 text-xs text-ink-soft md:grid-cols-2">
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
