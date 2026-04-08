import type { StationState } from "@orbital/shared";
import { Compass, Play, RotateCcw, ShieldAlert, Sparkles, Telescope } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useUiPreferences } from "../app/ui-context";
import { useAudio } from "../features/audio/audio-provider";
import { type ExpeditionHint, type ExpeditionReport, useExpeditionReport } from "../features/expedition/expedition-store";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";

type Phase = "briefing" | "running" | "finished";
type InputState = { left: boolean; right: boolean; boost: boolean };
type Entity = {
  id: number;
  kind: "asteroid" | "shard";
  x: number;
  z: number;
  radius: number;
  drift: number;
};

type Star = {
  x: number;
  y: number;
  depth: number;
};

const durationSeconds = 52;
const baseCollisionLimit = 3;

function profileHint(distance: number, dataShards: number, collisions: number, collisionLimit: number): ExpeditionHint {
  if (collisions >= collisionLimit) {
    return "risk";
  }
  if (dataShards >= 11) {
    return "research";
  }
  if (collisions >= 2) {
    return "engineering";
  }
  if (distance >= 2900) {
    return "command";
  }
  return "engineering";
}

function scoreRun(distance: number, dataShards: number, collisions: number): number {
  const value = distance * 2.18 + dataShards * 145 - collisions * 230;
  return Math.max(0, Math.round(value));
}

export function ExpeditionPage({ station }: { station: StationState }): ReactElement {
  const audio = useAudio();
  const { t } = useI18n();
  const { reducedSensoryMode } = useUiPreferences();
  const { report: latestReport, setReport } = useExpeditionReport();

  const [phase, setPhase] = useState<Phase>("briefing");
  const [runtime, setRuntime] = useState({
    elapsed: 0,
    distance: 0,
    dataShards: 0,
    collisions: 0,
    threat: 0,
    hull: 100,
    speed: 1
  });
  const [finishedReport, setFinishedReport] = useState<ExpeditionReport | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastRuntimePushRef = useRef(0);
  const entitySeedRef = useRef(0);
  const starsRef = useRef<Star[]>([]);
  const entitiesRef = useRef<Entity[]>([]);
  const inputRef = useRef<InputState>({ left: false, right: false, boost: false });
  const shipXRef = useRef(0);
  const elapsedRef = useRef(0);
  const distanceRef = useRef(0);
  const dataRef = useRef(0);
  const collisionsRef = useRef(0);
  const spawnTickRef = useRef(0);
  const hitFlashRef = useRef(0);

  const severityFactor = useMemo(() => {
    if (station.runSummary.severity === "crisis") {
      return 1.18;
    }
    if (station.runSummary.severity === "alert") {
      return 1.09;
    }
    return 1;
  }, [station.runSummary.severity]);

  const expeditionTuning = useMemo(() => {
    const reactor = station.modules.find((module) => module.type === "reactor");
    const researchLab = station.modules.find((module) => module.type === "researchLab");
    const repairBay = station.modules.find((module) => module.type === "repairBay");
    const reactorLevel = reactor?.level ?? 1;
    const researchLevel = researchLab?.level ?? 1;
    const repairLevel = repairBay?.level ?? 1;

    const handling =
      1 +
      reactorLevel * 0.05 +
      (station.commandState.subsystemFocus === "integrity" ? 0.12 : 0) +
      (station.commandState.powerProfile === "shielded" ? 0.07 : 0) -
      (station.runSummary.severity === "crisis" ? 0.08 : 0);
    const shardChance = Math.max(
      0.24,
      Math.min(0.58, 0.29 + researchLevel * 0.025 + (station.commandState.subsystemFocus === "research" ? 0.08 : 0))
    );
    const spawnRate =
      1 +
      (station.runSummary.severity === "alert" ? 0.08 : 0) +
      (station.runSummary.severity === "crisis" ? 0.16 : 0) -
      (station.commandState.powerProfile === "shielded" ? 0.06 : 0);
    const collisionLimit = Math.max(
      baseCollisionLimit,
      baseCollisionLimit + (station.commandState.powerProfile === "shielded" ? 1 : 0) + (repairLevel >= 3 ? 1 : 0)
    );
    const scoreMultiplier = 1 + researchLevel * 0.04 + (station.commandState.subsystemFocus === "research" ? 0.08 : 0);

    return {
      handling: Math.max(0.9, handling),
      shardChance,
      spawnRate: Math.max(0.8, spawnRate),
      collisionLimit: Math.min(5, collisionLimit),
      scoreMultiplier
    };
  }, [station.commandState.powerProfile, station.commandState.subsystemFocus, station.modules, station.runSummary.severity]);

  const createStarfield = useCallback(
    (count: number): Star[] =>
      Array.from({ length: count }).map(() => ({
        x: Math.random(),
        y: Math.random(),
        depth: Math.random()
      })),
    []
  );

  const spawnEntity = useCallback((riskFactor: number, shardChance: number) => {
    const isShard = Math.random() < shardChance;
    entitySeedRef.current += 1;
    const radius = isShard ? 0.066 : 0.11 + Math.random() * 0.09 * riskFactor;
    entitiesRef.current.push({
      id: entitySeedRef.current,
      kind: isShard ? "shard" : "asteroid",
      x: (Math.random() * 2 - 1) * 1.1,
      z: 1.2,
      radius,
      drift: (Math.random() * 2 - 1) * 0.2
    });
  }, []);

  const finalizeRun = useCallback(
    (outcome: "success" | "failure") => {
      const score = scoreRun(distanceRef.current, dataRef.current, collisionsRef.current);
      const nextReport: ExpeditionReport = {
        id: `exp-${Date.now()}`,
        createdAt: new Date().toISOString(),
        distance: Math.round(distanceRef.current),
        dataShards: dataRef.current,
        collisions: collisionsRef.current,
        score: Math.round(score * expeditionTuning.scoreMultiplier),
        outcome,
        hint: profileHint(distanceRef.current, dataRef.current, collisionsRef.current, expeditionTuning.collisionLimit)
      };
      setFinishedReport(nextReport);
      setReport(nextReport);
      setPhase("finished");
      audio.playEffect(outcome === "success" ? "confirm" : "emergency");
    },
    [audio, expeditionTuning.collisionLimit, expeditionTuning.scoreMultiplier, setReport]
  );

  const resetRunState = useCallback(() => {
    elapsedRef.current = 0;
    distanceRef.current = 0;
    dataRef.current = 0;
    collisionsRef.current = 0;
    spawnTickRef.current = 0;
    shipXRef.current = 0;
    entitiesRef.current = [];
    starsRef.current = createStarfield(reducedSensoryMode ? 76 : 130);
    setRuntime({
      elapsed: 0,
      distance: 0,
      dataShards: 0,
      collisions: 0,
      threat: 0,
      hull: 100,
      speed: 1
    });
    hitFlashRef.current = 0;
  }, [createStarfield, reducedSensoryMode]);

  const startRun = useCallback(() => {
    audio.playEffect("transition");
    resetRunState();
    setFinishedReport(null);
    setPhase("running");
    lastFrameRef.current = performance.now();
    lastRuntimePushRef.current = performance.now();
  }, [audio, resetRunState]);

  useEffect(() => {
    if (phase !== "running") {
      audio.setAmbienceProfile("command");
      return;
    }

    if (runtime.threat >= 70 || runtime.hull <= 34) {
      audio.setAmbienceProfile("emergency");
      return;
    }
    if (runtime.threat >= 38) {
      audio.setAmbienceProfile("action");
      return;
    }
    audio.setAmbienceProfile("command");
  }, [audio, phase, runtime.hull, runtime.threat]);

  useEffect(() => {
    if (phase !== "running") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        inputRef.current.left = true;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        inputRef.current.right = true;
      }
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.key === " ") {
        inputRef.current.boost = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        inputRef.current.left = false;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        inputRef.current.right = false;
      }
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.key === " ") {
        inputRef.current.boost = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const syncCanvasSize = () => {
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      canvas.width = Math.floor(parent.clientWidth);
      canvas.height = Math.floor(parent.clientHeight);
    };

    syncCanvasSize();
    const onResize = () => {
      if (resizeRef.current) {
        window.clearTimeout(resizeRef.current);
      }
      resizeRef.current = window.setTimeout(syncCanvasSize, 40);
    };
    window.addEventListener("resize", onResize);

    const renderFrame = (timestamp: number) => {
      const deltaRaw = (timestamp - lastFrameRef.current) / 1000;
      const dt = Math.max(0.008, Math.min(0.05, Number.isFinite(deltaRaw) ? deltaRaw : 0.016));
      lastFrameRef.current = timestamp;

      const width = canvas.width;
      const height = canvas.height;
      const riskFactor = severityFactor;
      const input = inputRef.current;
      const lateralSpeed = (input.boost ? 0.95 : 0.7) * riskFactor * expeditionTuning.handling;

      if (input.left) {
        shipXRef.current = Math.max(-1.16, shipXRef.current - lateralSpeed * dt * 2);
      }
      if (input.right) {
        shipXRef.current = Math.min(1.16, shipXRef.current + lateralSpeed * dt * 2);
      }

      const targetSpeed = (input.boost ? 1.95 : 1.22) * riskFactor;
      const speed = targetSpeed;
      elapsedRef.current += dt;
      distanceRef.current += dt * speed * 84;
      spawnTickRef.current += dt;

      const spawnEvery = (reducedSensoryMode ? 0.62 : 0.46) / expeditionTuning.spawnRate;
      if (spawnTickRef.current >= spawnEvery) {
        spawnEntity(riskFactor, expeditionTuning.shardChance);
        spawnTickRef.current = 0;
      }

      entitiesRef.current = entitiesRef.current.filter((entity) => {
        entity.z -= dt * (1.18 + speed * 0.9);
        entity.x += entity.drift * dt;

        if (entity.z < -0.22) {
          return false;
        }

        const deltaX = Math.abs(entity.x - shipXRef.current);
        const collisionBand = entity.z < 0.15 && entity.z > -0.02;
        if (!collisionBand) {
          return true;
        }

        if (deltaX > entity.radius + 0.1) {
          return true;
        }

        if (entity.kind === "shard") {
          dataRef.current += 1;
          audio.playEffect("confirm");
          return false;
        }

        collisionsRef.current += 1;
        hitFlashRef.current = Math.min(1, hitFlashRef.current + 0.78);
        audio.playEffect(collisionsRef.current >= expeditionTuning.collisionLimit ? "emergency" : "warning");
        return false;
      });

      if (collisionsRef.current >= expeditionTuning.collisionLimit) {
        finalizeRun("failure");
        return;
      }

      if (elapsedRef.current >= durationSeconds) {
        finalizeRun("success");
        return;
      }

      let threat = 0;
      for (const entity of entitiesRef.current) {
        if (entity.kind !== "asteroid" || entity.z < -0.02 || entity.z > 0.46) {
          continue;
        }
        const laneDelta = Math.abs(entity.x - shipXRef.current);
        const laneProximity = Math.max(0, 1 - laneDelta / (entity.radius + 0.24));
        const depthPressure = Math.max(0, 1 - entity.z / 0.46);
        threat = Math.max(threat, laneProximity * depthPressure);
      }
      const threatPercent = Math.max(
        0,
        Math.min(100, Math.round(threat * 100 + (collisionsRef.current / expeditionTuning.collisionLimit) * 26))
      );
      const hull = Math.max(0, 100 - collisionsRef.current * (100 / expeditionTuning.collisionLimit));
      if (timestamp - lastRuntimePushRef.current > 110) {
        lastRuntimePushRef.current = timestamp;
        setRuntime({
          elapsed: elapsedRef.current,
          distance: distanceRef.current,
          dataShards: dataRef.current,
          collisions: collisionsRef.current,
          threat: threatPercent,
          hull,
          speed
        });
      }

      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#030918");
      gradient.addColorStop(0.45, "#07122a");
      gradient.addColorStop(1, "#050d1c");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const driftX = Math.sin(elapsedRef.current * 0.46) * (reducedSensoryMode ? 2 : 4);

      starsRef.current.forEach((star) => {
        const drift = (0.12 + star.depth * 0.36) * speed * dt * (reducedSensoryMode ? 0.7 : 1);
        star.y += drift;
        if (star.y > 1.05) {
          star.y = -0.02;
          star.x = Math.random();
        }
        const size = 0.6 + star.depth * 1.8;
        const alpha = 0.35 + star.depth * 0.5;
        context.fillStyle = `rgba(210,235,255,${alpha})`;
        context.fillRect(star.x * width + driftX * (0.2 + star.depth), star.y * height, size, size);
      });

      const streakCount = reducedSensoryMode ? 8 : 14;
      for (let index = 0; index < streakCount; index += 1) {
        const x = ((index + 1) / (streakCount + 1)) * width + driftX * 0.4;
        const y = ((elapsedRef.current * 180 + index * 32) % (height + 60)) - 30;
        const streakLength = 10 + speed * 14 + (index % 3) * 6;
        context.strokeStyle = `rgba(157,211,255,${0.08 + (index % 4) * 0.04})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + streakLength);
        context.stroke();
      });

      context.strokeStyle = "rgba(122,208,255,0.22)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(width * 0.2, height * 0.9);
      context.lineTo(width * 0.48, height * 0.35);
      context.moveTo(width * 0.8, height * 0.9);
      context.lineTo(width * 0.52, height * 0.35);
      context.stroke();

      const shipX = width * 0.5 + shipXRef.current * width * 0.24 + driftX;
      const shipY = height * 0.83;

      entitiesRef.current.forEach((entity) => {
        const perspective = 1.3 - entity.z;
        const x = width * 0.5 + entity.x * width * 0.24 * perspective + driftX;
        const y = height * (0.2 + entity.z * 0.68);
        const size = Math.max(4, entity.radius * width * 0.07 * perspective);

        if (entity.kind === "shard") {
          context.fillStyle = "rgba(122,230,255,0.95)";
          context.beginPath();
          context.moveTo(x, y - size);
          context.lineTo(x + size * 0.7, y);
          context.lineTo(x, y + size);
          context.lineTo(x - size * 0.7, y);
          context.closePath();
          context.fill();
          context.strokeStyle = "rgba(191,245,255,0.85)";
          context.lineWidth = 1.1;
          context.stroke();
          return;
        }

        const asteroidGradient = context.createRadialGradient(x - size * 0.25, y - size * 0.2, size * 0.16, x, y, size);
        asteroidGradient.addColorStop(0, "rgba(205,214,234,0.9)");
        asteroidGradient.addColorStop(0.55, "rgba(122,136,166,0.92)");
        asteroidGradient.addColorStop(1, "rgba(70,79,103,0.98)");
        context.fillStyle = asteroidGradient;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(192,214,255,0.25)";
        context.lineWidth = 1;
        context.stroke();

        if (entity.z < 0.36 && Math.abs(entity.x - shipXRef.current) < entity.radius + 0.3) {
          context.strokeStyle = "rgba(255,176,120,0.5)";
          context.lineWidth = 1.2;
          context.beginPath();
          context.arc(x, y, size * 1.28, 0, Math.PI * 2);
          context.stroke();
        }
      });

      context.fillStyle = "rgba(146,226,255,0.94)";
      context.beginPath();
      context.moveTo(shipX, shipY - 18);
      context.lineTo(shipX + 12, shipY + 14);
      context.lineTo(shipX - 12, shipY + 14);
      context.closePath();
      context.fill();

      context.fillStyle = input.boost ? "rgba(122,208,255,0.84)" : "rgba(122,208,255,0.48)";
      context.beginPath();
      context.moveTo(shipX - 5, shipY + 14);
      context.lineTo(shipX + 5, shipY + 14);
      context.lineTo(shipX, shipY + (input.boost ? 34 : 25));
      context.closePath();
      context.fill();

      if (hitFlashRef.current > 0.01) {
        context.fillStyle = `rgba(255,74,74,${0.22 * hitFlashRef.current})`;
        context.fillRect(0, 0, width, height);
        hitFlashRef.current = Math.max(0, hitFlashRef.current - dt * 1.8);
      }

      if (threatPercent >= 66) {
        context.fillStyle = "rgba(255,170,96,0.08)";
        context.fillRect(0, 0, width, height);
      }

      animationRef.current = requestAnimationFrame(renderFrame);
    };

    animationRef.current = requestAnimationFrame(renderFrame);
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeRef.current) {
        window.clearTimeout(resizeRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audio, expeditionTuning, finalizeRun, phase, reducedSensoryMode, severityFactor, spawnEntity]);

  const loopProgress = Math.min(100, (runtime.elapsed / durationSeconds) * 100);
  const suggestedProfileLabel = finishedReport ? t(`expedition.hint.${finishedReport.hint}`) : null;

  return (
    <section className="grid gap-4">
      <header className="depth-panel flex items-center justify-between rounded-[24px] border border-white/16 p-5 shadow-[0_20px_34px_rgba(2,7,16,0.42)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("expedition.eyebrow")}</p>
          <h2 className="font-display text-2xl text-ink-strong">{t("expedition.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("expedition.subtitle")}</p>
        </div>
        <Telescope className="h-6 w-6 text-accent-sky" />
      </header>

      <article className="mission-loop-board">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.objective")}</p>
        <p className="mt-1 text-sm text-ink-normal">{t("expedition.objectiveBody")}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="mission-loop-step mission-loop-step--current">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.controls")}</p>
            <p className="mt-1 text-sm text-ink-normal">{t("expedition.controlsBody")}</p>
          </div>
          <div className={cn("mission-loop-step", phase === "finished" && "mission-loop-step--done")}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.rewards")}</p>
            <p className="mt-1 text-sm text-ink-normal">{t("expedition.rewardsBody")}</p>
          </div>
          <div className="mission-loop-step">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.loopLink")}</p>
            <p className="mt-1 text-sm text-ink-normal">{t("expedition.loopLinkBody")}</p>
          </div>
        </div>
      </article>

      <article className="depth-panel expedition-canvas-wrap min-h-[460px] p-3">
        {phase === "running" ? <canvas ref={canvasRef} className="h-[460px] w-full rounded-[16px]" /> : null}

        {phase === "briefing" ? (
          <div className="grid h-[460px] place-items-center rounded-[16px] border border-white/14 bg-black/24 p-6 text-center">
            <div className="max-w-xl">
              <Compass className="mx-auto h-8 w-8 text-accent-sky" />
              <h3 className="mt-3 font-display text-2xl text-ink-strong">{t("expedition.briefingTitle")}</h3>
              <p className="mt-2 text-sm text-ink-normal">{t("expedition.briefingBody")}</p>
              <div className="mt-4 grid gap-2 text-left sm:grid-cols-3">
                <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                  {t("expedition.tuning.handling")}:{" "}
                  <span className="text-ink-strong">+{formatNumber((expeditionTuning.handling - 1) * 100, 0)}%</span>
                </p>
                <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                  {t("expedition.tuning.signal")}:{" "}
                  <span className="text-ink-strong">{formatNumber(expeditionTuning.shardChance * 100, 0)}%</span>
                </p>
                <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                  {t("expedition.tuning.tolerance")}:{" "}
                  <span className="text-ink-strong">
                    {expeditionTuning.collisionLimit} {t("expedition.collisions")}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={startRun}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent-sky/60 bg-accent-sky/12 px-4 py-2.5 text-sm text-accent-sky transition hover:bg-accent-sky/18"
              >
                <Play className="h-4 w-4" />
                {t("expedition.start")}
              </button>
            </div>
          </div>
        ) : null}

        {phase === "finished" && finishedReport ? (
          <div className="grid h-[460px] place-items-center rounded-[16px] border border-white/14 bg-black/24 p-6 text-center">
            <div className="max-w-xl">
              <Sparkles className="mx-auto h-8 w-8 text-accent-teal" />
              <h3 className="mt-3 font-display text-2xl text-ink-strong">{t("expedition.reportTitle")}</h3>
              <p className="mt-2 text-sm text-ink-normal">{t("expedition.reportBody")}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <p className="rounded-xl border border-white/14 bg-black/24 px-3 py-2 text-sm text-ink-normal">
                  {t("expedition.distance")}: <span className="text-ink-strong">{formatNumber(finishedReport.distance, 0)} km</span>
                </p>
                <p className="rounded-xl border border-white/14 bg-black/24 px-3 py-2 text-sm text-ink-normal">
                  {t("expedition.shards")}: <span className="text-ink-strong">{finishedReport.dataShards}</span>
                </p>
                <p className="rounded-xl border border-white/14 bg-black/24 px-3 py-2 text-sm text-ink-normal">
                  {t("expedition.collisions")}:{" "}
                  <span className="text-ink-strong">
                    {finishedReport.collisions}/{expeditionTuning.collisionLimit}
                  </span>
                </p>
                <p className="rounded-xl border border-white/14 bg-black/24 px-3 py-2 text-sm text-ink-normal">
                  {t("expedition.score")}: <span className="text-ink-strong">{formatNumber(finishedReport.score, 0)}</span>
                </p>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-accent-sky">
                {t("expedition.suggestedDirective")} {suggestedProfileLabel}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startRun}
                  className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-black/24 px-4 py-2 text-sm text-ink-normal transition hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("expedition.retry")}
                </button>
                <Link
                  to={`/dashboard?expeditionHint=${finishedReport.hint}`}
                  className="inline-flex items-center gap-2 rounded-full border border-accent-teal/60 bg-accent-teal/12 px-4 py-2 text-sm text-accent-teal transition hover:bg-accent-teal/18"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {t("expedition.applyHint")}
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "running" ? (
          <div className="pointer-events-none absolute left-6 top-6 right-6 z-20 grid gap-2 md:grid-cols-5">
            <p className="rounded-xl border border-white/16 bg-black/36 px-3 py-1.5 text-xs text-ink-normal">
              {t("expedition.distance")}: {formatNumber(runtime.distance, 0)} km
            </p>
            <p className="rounded-xl border border-white/16 bg-black/36 px-3 py-1.5 text-xs text-ink-normal">
              {t("expedition.shards")}: {runtime.dataShards}
            </p>
            <p className="rounded-xl border border-white/16 bg-black/36 px-3 py-1.5 text-xs text-ink-normal">
              {t("expedition.hull")}: {runtime.hull}% | {t("expedition.collisions")}: {runtime.collisions}/
              {expeditionTuning.collisionLimit}
            </p>
            <p className="rounded-xl border border-white/16 bg-black/36 px-3 py-1.5 text-xs text-ink-normal">
              {t("expedition.time")}: {Math.max(0, Math.ceil(durationSeconds - runtime.elapsed))}s
            </p>
            <p
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs",
                runtime.threat >= 70
                  ? "border-accent-red/55 bg-accent-red/20 text-accent-red"
                  : runtime.threat >= 40
                    ? "border-accent-amber/55 bg-accent-amber/15 text-accent-amber"
                    : "border-accent-teal/45 bg-accent-teal/12 text-accent-teal"
              )}
            >
              {t("expedition.threat")}: {runtime.threat}%
            </p>
          </div>
        ) : null}
      </article>

      {phase === "running" ? (
        <div className="depth-panel grid gap-3 rounded-[20px] border border-white/14 p-4 md:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.progress")}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-sky/88 via-accent-teal/82 to-accent-sky/86"
                style={{ width: `${Math.max(0, Math.min(100, loopProgress))}%` }}
              />
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.hull")}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r",
                  runtime.hull < 35
                    ? "from-accent-red/92 to-accent-red/60"
                    : runtime.hull < 65
                      ? "from-accent-amber/88 to-accent-amber/60"
                      : "from-accent-teal/90 to-accent-sky/62"
                )}
                style={{ width: `${Math.max(0, Math.min(100, runtime.hull))}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {latestReport ? (
        <article className="rounded-[20px] border border-white/14 bg-black/22 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.lastReport")}</p>
          <p className="mt-1 text-sm text-ink-normal">
            {t("expedition.score")}: {formatNumber(latestReport.score, 0)} | {t("expedition.hintLabel")}{" "}
            {t(`expedition.hint.${latestReport.hint}`)}
          </p>
        </article>
      ) : null}
    </section>
  );
}
