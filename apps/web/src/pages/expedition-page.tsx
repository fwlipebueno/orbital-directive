import type { StationState } from "@orbital/shared";
import { AlertTriangle, Compass, Play, RotateCcw, ShieldAlert, Sparkles, Telescope, Zap } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useUiPreferences } from "../app/ui-context";
import { useAudio } from "../features/audio/audio-provider";
import {
  type ExpeditionFailureReason,
  type ExpeditionHint,
  type ExpeditionReport,
  useExpeditionReport
} from "../features/expedition/expedition-store";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";

// ─── Types ─────────────────────────────────────────────────────────────────
type GamePhase = "briefing" | "running" | "finished";
type MissionZone = "entry" | "deepField" | "extraction";
type ScenarioVariant = "base" | "aurora" | "crimson" | "binary";

interface InputState {
  left: boolean;
  right: boolean;
  boost: boolean;
}

interface Entity {
  id: number;
  kind: "asteroid" | "beacon";
  x: number;         // normalized -1..1
  z: number;         // 0=player, 1.2=spawn horizon
  radius: number;
  drift: number;
  polygon?: number[]; // for asteroids: offset angles
  spin?: number;
  collected?: boolean;
}

interface StarLayer {
  x: number;
  y: number;
  depth: number; // 0=near, 1=far
  twinkle: number; // phase
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const DURATION_SECONDS = 70;
const BASE_COLLISION_LIMIT = 6;
const HORIZON_Y = 0.20;
const PLAYER_Y = 0.82;
const ENTITY_SPAWN_Z = 1.55;
const SAFE_OPENING_SECONDS = 14;
const HIT_INVULNERABILITY_SECONDS = 1.2;
const DEATH_SEQUENCE_SECONDS = 1.15;

const WORMHOLE_START_SECONDS = 18;
const WORMHOLE_OPEN_SECONDS = 14;
const WORMHOLE_TRAVEL_SECONDS = 4.2;

const PLAYER_COLLISION_RADIUS = 0.08;
const ASTEROID_COLLISION_RADIUS_SCALE = 0.68;
const ASTEROID_COLLISION_FORGIVENESS = 0.012;

// Mission zones (by elapsed fraction)
const ZONE_THRESHOLDS = { entry: 0, deepField: 0.32, extraction: 0.72 };

function getZone(elapsed: number): MissionZone {
  const frac = elapsed / DURATION_SECONDS;
  if (frac >= ZONE_THRESHOLDS.extraction) return "extraction";
  if (frac >= ZONE_THRESHOLDS.deepField) return "deepField";
  return "entry";
}

// Zone visual tints
const ZONE_COLORS = {
  entry: { nebula: "rgba(60,90,180,0.12)", accent: "#7ad0ff", label: "Entrada da zona" },
  deepField: { nebula: "rgba(90,40,130,0.18)", accent: "#b87dff", label: "Campo profundo" },
  extraction: { nebula: "rgba(180,80,60,0.18)", accent: "#ff9060", label: "Janela de extração" }
} as const;

function profileHint(distance: number, beacons: number, collisions: number, collisionLimit: number): ExpeditionHint {
  if (collisions >= collisionLimit) return "risk";
  if (beacons >= 10) return "research";
  if (collisions >= 2) return "engineering";
  if (distance >= 3200) return "command";
  return "engineering";
}

function scoreRun(distance: number, beacons: number, collisions: number, zone: MissionZone): number {
  const zoneBonus = zone === "extraction" ? 1.4 : zone === "deepField" ? 1.1 : 1.0;
  return Math.max(0, Math.round((distance * 2.4 + beacons * 160 - collisions * 200) * zoneBonus));
}

// Generate an irregular polygon for asteroids
function makePolygon(sides: number): number[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    const wobble = 0.72 + Math.random() * 0.28;
    return angle + (Math.random() - 0.5) * ((Math.PI * 2) / sides) * 0.45;
  });
}

function nextScenarioVariant(current: ScenarioVariant): ScenarioVariant {
  const variants: ScenarioVariant[] = ["aurora", "crimson", "binary"];
  const eligible = variants.filter((variant) => variant !== current);
  return eligible[Math.floor(Math.random() * eligible.length)] ?? "aurora";
}

// ─── Component ─────────────────────────────────────────────────────────────
export function ExpeditionPage({ station }: { station: StationState }): ReactElement {
  const audio = useAudio();
  const { t } = useI18n();
  const { reducedSensoryMode } = useUiPreferences();
  const { report: latestReport, setReport } = useExpeditionReport();

  const [gamePhase, setGamePhase] = useState<GamePhase>("briefing");
  const [runtime, setRuntime] = useState({
    elapsed: 0,
    distance: 0,
    beacons: 0,
    collisions: 0,
    threat: 0,
    hull: 100,
    zone: "entry" as MissionZone,
    nearMiss: false,
  });
  const [currentZone, setCurrentZone] = useState<MissionZone>("entry");
  const [zoneAnnounce, setZoneAnnounce] = useState<{ zone: MissionZone; ts: number } | null>(null);
  const [finishedReport, setFinishedReport] = useState<ExpeditionReport | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);

  // All mutable game state in refs (no re-renders in loop)
  const lastFrameRef = useRef(0);
  const lastPushRef = useRef(0);
  const entitySeedRef = useRef(0);
  const particleSeedRef = useRef(0);
  const layerARef = useRef<StarLayer[]>([]); // near stars
  const layerBRef = useRef<StarLayer[]>([]); // far stars (parallax)
  const dustRef = useRef<StarLayer[]>([]);   // cosmic dust
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const inputRef = useRef<InputState>({ left: false, right: false, boost: false });
  const shipXRef = useRef(0);
  const shipVelXRef = useRef(0);
  const elapsedRef = useRef(0);
  const distanceRef = useRef(0);
  const beaconsRef = useRef(0);
  const collisionsRef = useRef(0);
  const spawnTickRef = useRef(0);
  const hitFlashRef = useRef(0);
  const shakeRef = useRef(0);
  const beaconFlashRef = useRef(0);
  const nearMissFlashRef = useRef(0);
  const prevZoneRef = useRef<MissionZone>("entry");
  const exhaustParticleTickRef = useRef(0);
  const zoneTransitionRef = useRef(0); // flash when zone changes
  const damageCooldownRef = useRef(0);
  const runResolvedRef = useRef(false);
  const wormholeStateRef = useRef<"idle" | "open" | "travel" | "passed">("idle");
  const wormholeTimerRef = useRef(0);
  const wormholeProgressRef = useRef(0);
  const scenarioVariantRef = useRef<ScenarioVariant>("base");

  // ─── Tuning based on station state ─────────────────────────────────────
  const expeditionTuning = useMemo(() => {
    const reactor = station.modules.find((m) => m.type === "reactor");
    const researchLab = station.modules.find((m) => m.type === "researchLab");
    const repairBay = station.modules.find((m) => m.type === "repairBay");

    const reactorLevel = reactor?.level ?? 1;
    const researchLevel = researchLab?.level ?? 1;
    const repairLevel = repairBay?.level ?? 1;
    const sevCrisis = station.runSummary.severity === "crisis";
    const sevAlert = station.runSummary.severity === "alert";

    const handling = Math.max(0.85, 1
      + reactorLevel * 0.04
      + (station.commandState.subsystemFocus === "integrity" ? 0.10 : 0)
      + (station.commandState.powerProfile === "shielded" ? 0.06 : 0)
      - (sevCrisis ? 0.10 : sevAlert ? 0.04 : 0)
    );

    const beaconChance = Math.max(0.22, Math.min(0.55,
      0.26 + researchLevel * 0.03
      + (station.commandState.subsystemFocus === "research" ? 0.08 : 0)
    ));

    const spawnRate = Math.max(0.75, 1
      + (sevAlert ? 0.07 : 0)
      + (sevCrisis ? 0.15 : 0)
      - (station.commandState.powerProfile === "shielded" ? 0.06 : 0)
    );

    const collisionLimit = Math.min(8,
      BASE_COLLISION_LIMIT
      + (station.commandState.powerProfile === "shielded" ? 1 : 0)
      + (repairLevel >= 3 ? 1 : 0)
    );

    const targetBeacons = Math.max(
      4,
      Math.min(
        10,
        6 +
          (sevAlert ? 1 : 0) +
          (sevCrisis ? 2 : 0) +
          (station.commandState.subsystemFocus === "research" ? 1 : 0) -
          Math.max(0, researchLevel - 2)
      )
    );

    const scoreMultiplier = 1
      + researchLevel * 0.04
      + (station.commandState.subsystemFocus === "research" ? 0.08 : 0);

    return { handling, beaconChance, spawnRate, collisionLimit, scoreMultiplier, targetBeacons };
  }, [station]);

  // ─── Scroll lock during gameplay ────────────────────────────────────────
  useLayoutEffect(() => {
    if (gamePhase !== "running") return;

    const scrollY = window.scrollY;
    const savedBodyOverflow = document.body.style.overflow;
    const savedBodyPosition = document.body.style.position;
    const savedBodyTop = document.body.style.top;
    const savedBodyLeft = document.body.style.left;
    const savedBodyRight = document.body.style.right;
    const savedBodyWidth = document.body.style.width;
    const savedHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = savedBodyOverflow;
      document.body.style.position = savedBodyPosition;
      document.body.style.top = savedBodyTop;
      document.body.style.left = savedBodyLeft;
      document.body.style.right = savedBodyRight;
      document.body.style.width = savedBodyWidth;
      document.documentElement.style.overflow = savedHtmlOverflow;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [gamePhase]);

  // ─── Starfield factories ─────────────────────────────────────────────────
  const createStarLayers = useCallback(() => {
    const count = reducedSensoryMode ? 60 : 140;
    layerARef.current = Array.from({ length: Math.floor(count * 0.4) }, () => ({
      x: Math.random(), y: Math.random(), depth: 0.1 + Math.random() * 0.3, twinkle: Math.random() * Math.PI * 2
    }));
    layerBRef.current = Array.from({ length: Math.floor(count * 0.6) }, () => ({
      x: Math.random(), y: Math.random(), depth: 0.5 + Math.random() * 0.5, twinkle: Math.random() * Math.PI * 2
    }));
    dustRef.current = Array.from({ length: reducedSensoryMode ? 20 : 60 }, () => ({
      x: Math.random(), y: Math.random(), depth: Math.random(), twinkle: 0
    }));
  }, [reducedSensoryMode]);

  // ─── Spawn helper ────────────────────────────────────────────────────────
  const spawnEntity = useCallback((zone: MissionZone, beaconChance: number, spawnRate: number, safeOpening: boolean) => {
    if (entitiesRef.current.length > 34) {
      return;
    }

    // Zone-based spawn density multiplier
    const zoneScale = zone === "deepField" ? 1.05 : zone === "extraction" ? 1.25 : 0.75;

    const isBeacon = Math.random() < beaconChance;
    entitySeedRef.current += 1;

    const radius = isBeacon
      ? 0.045 + Math.random() * 0.015
      : 0.07 + Math.random() * 0.10 * zoneScale * spawnRate;

    const sides = isBeacon ? 0 : 5 + Math.floor(Math.random() * 3);
    const polygon = sides > 0 ? makePolygon(sides) : null;

    let spawnX = (Math.random() * 2 - 1) * 1.08;
    if (safeOpening && !isBeacon) {
      let attempts = 0;
      while (Math.abs(spawnX - shipXRef.current) < 0.34 && attempts < 8) {
        spawnX = (Math.random() * 2 - 1) * 1.08;
        attempts += 1;
      }
    }

    entitiesRef.current.push({
      id: entitySeedRef.current,
      kind: isBeacon ? "beacon" : "asteroid",
      x: spawnX,
      z: ENTITY_SPAWN_Z,
      radius,
      drift: (Math.random() * 2 - 1) * 0.15,
      ...(polygon ? { polygon } : {}),
      spin: (Math.random() - 0.5) * 0.8,
    });
  }, []);

  // ─── Particle emitter ────────────────────────────────────────────────────
  const emitParticles = useCallback((
    x: number, y: number,
    count: number,
    color: string,
    speed: number,
    life: number
  ) => {
    if (particlesRef.current.length > (reducedSensoryMode ? 120 : 260)) {
      return;
    }
    const spawnCount = Math.max(1, Math.min(count, reducedSensoryMode ? 8 : 14));
    for (let i = 0; i < spawnCount; i++) {
      particleSeedRef.current += 1;
      const angle = Math.random() * Math.PI * 2;
      const vel = (0.3 + Math.random() * 0.7) * speed;
      particlesRef.current.push({
        id: particleSeedRef.current,
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        life: life * (0.6 + Math.random() * 0.4),
        maxLife: life,
        color,
        size: 1 + Math.random() * 2.5,
      });
    }
  }, [reducedSensoryMode]);

  // ─── Finalize run ────────────────────────────────────────────────────────
  const finalizeRun = useCallback((outcome: "success" | "failure", failureReason?: ExpeditionFailureReason) => {
    if (runResolvedRef.current) {
      return;
    }
    runResolvedRef.current = true;
    const zone = getZone(elapsedRef.current);
    const score = scoreRun(distanceRef.current, beaconsRef.current, collisionsRef.current, zone);
    const report: ExpeditionReport = {
      id: `exp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      distance: Math.round(distanceRef.current),
      dataShards: beaconsRef.current,
      collisions: collisionsRef.current,
      score: Math.round(score * expeditionTuning.scoreMultiplier),
      outcome,
      hint: profileHint(distanceRef.current, beaconsRef.current, collisionsRef.current, expeditionTuning.collisionLimit),
      ...(outcome === "failure" ? { failureReason: failureReason ?? "missionIncomplete" } : {})
    };
    setFinishedReport(report);
    setGamePhase("finished");
    setReport(report);
    audio.playEffect(outcome === "success" ? "confirm" : "emergency");
  }, [audio, expeditionTuning, setReport]);

  // ─── Reset ───────────────────────────────────────────────────────────────
  const resetRun = useCallback(() => {
    runResolvedRef.current = false;
    elapsedRef.current = 0;
    distanceRef.current = 0;
    beaconsRef.current = 0;
    collisionsRef.current = 0;
    spawnTickRef.current = 0;
    shipXRef.current = 0;
    shipVelXRef.current = 0;
    hitFlashRef.current = 0;
    shakeRef.current = 0;
    beaconFlashRef.current = 0;
    nearMissFlashRef.current = 0;
    zoneTransitionRef.current = 0;
    damageCooldownRef.current = 0;
    wormholeStateRef.current = "idle";
    wormholeTimerRef.current = 0;
    wormholeProgressRef.current = 0;
    scenarioVariantRef.current = "base";
    exhaustParticleTickRef.current = 0;
    prevZoneRef.current = "entry";
    entitiesRef.current = [];
    particlesRef.current = [];
    createStarLayers();
    setRuntime({ elapsed: 0, distance: 0, beacons: 0, collisions: 0, threat: 0, hull: 100, zone: "entry", nearMiss: false });
    setCurrentZone("entry");
    setZoneAnnounce(null);
  }, [createStarLayers]);

  const startRun = useCallback(() => {
    audio.playEffect("transition");
    resetRun();
    runResolvedRef.current = false;
    setFinishedReport(null);
    setGamePhase("running");
    lastFrameRef.current = performance.now();
    lastPushRef.current = performance.now();
  }, [audio, resetRun]);

  // ─── Keyboard input ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== "running") return;
    const down = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) { e.preventDefault(); inputRef.current.left = true; }
      if (["ArrowRight", "d", "D"].includes(e.key)) { e.preventDefault(); inputRef.current.right = true; }
      if (["ArrowUp", "w", "W", " "].includes(e.key)) { e.preventDefault(); inputRef.current.boost = true; }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) { e.preventDefault(); inputRef.current.left = false; }
      if (["ArrowRight", "d", "D"].includes(e.key)) { e.preventDefault(); inputRef.current.right = false; }
      if (["ArrowUp", "w", "W", " "].includes(e.key)) { e.preventDefault(); inputRef.current.boost = false; }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [gamePhase]);

  // ─── Ambience ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== "running") { audio.setAmbienceProfile("command"); return; }
    const { threat, hull } = runtime;
    if (threat >= 72 || hull <= 30) { audio.setAmbienceProfile("emergency"); return; }
    if (threat >= 40 || currentZone === "extraction") { audio.setAmbienceProfile("action"); return; }
    if (currentZone === "deepField") { audio.setAmbienceProfile("risk"); return; }
    audio.setAmbienceProfile("command");
  }, [audio, gamePhase, runtime, currentZone]);

  // ─── Zone announcement cleanup ───────────────────────────────────────────
  useEffect(() => {
    if (!zoneAnnounce) return;
    const timer = window.setTimeout(() => setZoneAnnounce(null), 2200);
    return () => window.clearTimeout(timer);
  }, [zoneAnnounce]);

  // ─── Main game loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== "running") {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const syncSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(360, Math.floor(rect.height));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    syncSize();
    const onResize = () => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(syncSize, 40);
    };
    window.addEventListener("resize", onResize);

    const render = (ts: number) => {
      const rawDt = (ts - lastFrameRef.current) / 1000;
      const dt = Math.max(0.008, Math.min(0.05, Number.isFinite(rawDt) ? rawDt : 0.016));
      lastFrameRef.current = ts;

      const W = canvas.width;
      const H = canvas.height;
      const input = inputRef.current;
      const zone = getZone(elapsedRef.current);
      const safeOpening = elapsedRef.current < SAFE_OPENING_SECONDS;
      damageCooldownRef.current = Math.max(0, damageCooldownRef.current - dt);

      if (elapsedRef.current >= WORMHOLE_START_SECONDS && wormholeStateRef.current === "idle") {
        wormholeStateRef.current = "open";
        wormholeTimerRef.current = 0;
      }

      const wormholeOpen = wormholeStateRef.current === "open";
      const wormholeTravel = wormholeStateRef.current === "travel";

      // ── Zone detection & announcement ──
      if (zone !== prevZoneRef.current) {
        prevZoneRef.current = zone;
        setCurrentZone(zone);
        setZoneAnnounce({ zone, ts: Date.now() });
        zoneTransitionRef.current = 1;
        audio.playEffect(zone === "extraction" ? "warning" : "transition");
      }

      // ── Ship physics ──
      const accel = (input.boost ? 3.2 : 2.4) * expeditionTuning.handling;
      const lateralInput = input.left ? -1 : input.right ? 1 : 0;
      if (lateralInput !== 0) {
        shipVelXRef.current += lateralInput * accel * dt;
      } else {
        shipVelXRef.current *= Math.pow(0.02, dt);
      }
      const maxV = (input.boost ? 1.8 : 1.1) * expeditionTuning.handling;
      shipVelXRef.current = Math.max(-maxV, Math.min(maxV, shipVelXRef.current));
      shipXRef.current = Math.max(-1.12, Math.min(1.12, shipXRef.current + shipVelXRef.current * dt));

      // ── Time & distance ──
      const zonalSpeed = zone === "entry" ? 0.85 : zone === "extraction" ? 1.35 : 1.15;
      const baseSpeed = (input.boost ? 2.0 : 1.25) * zonalSpeed;
      elapsedRef.current += dt;
      distanceRef.current += dt * baseSpeed * 85;

      if (wormholeOpen) {
        wormholeTimerRef.current += dt;
        const canEnterWormhole =
          wormholeTimerRef.current > 1.8 &&
          Math.abs(shipXRef.current) < 0.14 &&
          (input.boost || wormholeTimerRef.current > 4.5);
        if (canEnterWormhole) {
          wormholeStateRef.current = "travel";
          wormholeProgressRef.current = 0;
          wormholeTimerRef.current = 0;
          damageCooldownRef.current = Math.max(damageCooldownRef.current, 1.8);
          audio.playEffect("confirm");
        } else if (wormholeTimerRef.current >= WORMHOLE_OPEN_SECONDS) {
          wormholeStateRef.current = "passed";
        }
      } else if (wormholeTravel) {
        wormholeProgressRef.current = Math.min(1, wormholeProgressRef.current + dt / WORMHOLE_TRAVEL_SECONDS);
        distanceRef.current += dt * 180;
        damageCooldownRef.current = Math.max(damageCooldownRef.current, 1.4);
        if (wormholeProgressRef.current >= 1) {
          wormholeStateRef.current = "passed";
          scenarioVariantRef.current = nextScenarioVariant(scenarioVariantRef.current);
          zoneTransitionRef.current = 1;
          wormholeTimerRef.current = 0;
          audio.playEffect("transition");
        }
      }

      // ── Spawn logic (zone-based density) ──
      spawnTickRef.current += dt;
      const baseInterval = reducedSensoryMode ? 0.78 : 0.58;
      const zoneIntervalScale = zone === "entry" ? 1.55 : zone === "deepField" ? 1.05 : 0.8;
      const spawnInterval = (baseInterval * zoneIntervalScale / expeditionTuning.spawnRate) * (safeOpening ? 2.6 : 1);
      if (!wormholeTravel && spawnTickRef.current >= spawnInterval) {
        spawnEntity(zone, expeditionTuning.beaconChance, expeditionTuning.spawnRate, safeOpening);
        spawnTickRef.current = 0;
      }

      // ── Entity physics & collision ──
      const zSpeed = 1.15 + baseSpeed * 0.9;
      let threat = 0;
      let anyNearMiss = false;

      entitiesRef.current = entitiesRef.current.filter((e) => {
        e.z -= dt * zSpeed;
        e.x += e.drift * dt;
        if (e.spin !== undefined) e.spin += dt * 0.6;
        if (e.z < -0.3) return false;

        if (wormholeTravel && e.kind === "asteroid") {
          return false;
        }

        // Collision window
        const collidable = e.z < 0.14 && e.z > -0.05;
        const dX = Math.abs(e.x - shipXRef.current);
        const hitRadius = e.radius + 0.022;

        if (collidable && dX < hitRadius) {
          if (e.kind === "beacon") {
            beaconsRef.current += 1;
            beaconFlashRef.current = 1;
            audio.playEffect("confirm");
            // Collect particles
            const bx = W / 2 + e.x * W * 0.26;
            const by = H * PLAYER_Y - 20;
            emitParticles(bx, by, 12, "#7adcff", 120, 0.5);
            return false;
          } else {
            if (damageCooldownRef.current > 0) {
              return false;
            }
            collisionsRef.current += 1;
            hitFlashRef.current = Math.min(1, hitFlashRef.current + 0.9);
            shakeRef.current = Math.min(1, shakeRef.current + 0.85);
            damageCooldownRef.current = HIT_INVULNERABILITY_SECONDS;
            const shipBx = W / 2 + shipXRef.current * W * 0.26;
            const shipBy = H * PLAYER_Y;
            emitParticles(shipBx, shipBy, 18, "#ff6040", 100, 0.65);
            audio.playEffect(collisionsRef.current >= expeditionTuning.collisionLimit ? "emergency" : "warning");
            return false;
          }
        }

        // Near-miss detection
        if (e.kind === "asteroid" && dX < e.radius + 0.26 && e.z < 0.42 && e.z > 0) {
          const proximity = 1 - (dX / (e.radius + 0.26));
          const depth = 1 - e.z / 0.42;
          const localThreat = proximity * depth;
          threat = Math.max(threat, localThreat);
          if (proximity > 0.7 && e.z < 0.15 && dX > hitRadius) {
            anyNearMiss = true;
            nearMissFlashRef.current = Math.min(1, nearMissFlashRef.current + 0.35);
          }
        }
        return true;
      });

      const threatPercent = Math.max(0, Math.min(100, Math.round(threat * 100)));
      const hull = Math.max(0, 100 - collisionsRef.current * (100 / expeditionTuning.collisionLimit));

      // ── End conditions ──
      if (collisionsRef.current >= expeditionTuning.collisionLimit) {
        cancelAnimationFrame(animationRef.current!);
        finalizeRun("failure", "hullBreach");
        return;
      }
      if (elapsedRef.current >= DURATION_SECONDS) {
        cancelAnimationFrame(animationRef.current!);
        finalizeRun("success");
        return;
      }

      // ── Exhaust particles ──
      exhaustParticleTickRef.current += dt;
      const exhaustInterval = input.boost ? 0.032 : 0.06;
      if (exhaustParticleTickRef.current >= exhaustInterval && !reducedSensoryMode) {
        exhaustParticleTickRef.current = 0;
        const shipBx = W / 2 + shipXRef.current * W * 0.26;
        const shipBy = H * PLAYER_Y + 20;
        const c = input.boost ? "#60a8ff" : "#4080c0";
        particlesRef.current.push({
          id: particleSeedRef.current++,
          x: shipBx + (Math.random() - 0.5) * 8,
          y: shipBy,
          vx: (Math.random() - 0.5) * 20,
          vy: 30 + Math.random() * 40,
          life: 0.3 + Math.random() * 0.25,
          maxLife: 0.6,
          color: c,
          size: 1.5 + Math.random() * 2,
        });
      }

      // ── Update particles ──
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 50 * dt; // gravity
        p.life -= dt;
        return p.life > 0;
      });

      // Decay effects
      hitFlashRef.current = Math.max(0, hitFlashRef.current - dt * 2.8);
      shakeRef.current = Math.max(0, shakeRef.current - dt * 4.5);
      beaconFlashRef.current = Math.max(0, beaconFlashRef.current - dt * 4);
      nearMissFlashRef.current = Math.max(0, nearMissFlashRef.current - dt * 3);
      zoneTransitionRef.current = Math.max(0, zoneTransitionRef.current - dt * 0.7);

      // ── Runtime push ──
      if (ts - lastPushRef.current > 100) {
        lastPushRef.current = ts;
        setRuntime({ elapsed: elapsedRef.current, distance: distanceRef.current, beacons: beaconsRef.current, collisions: collisionsRef.current, threat: threatPercent, hull, zone, nearMiss: anyNearMiss });
      }

      // ── RENDERING ──
      const shakeAmt = shakeRef.current * (reducedSensoryMode ? 0 : 8);
      const shakeX = shakeAmt * (Math.random() * 2 - 1);
      const shakeY = shakeAmt * (Math.random() * 2 - 1);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(shakeX, shakeY);

      const horizonY = H * HORIZON_Y;
      const playerY = H * PLAYER_Y;
      const vanishX = W * 0.5;
      const zoneColor = ZONE_COLORS[zone];

      // ── Background ──
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#02060e");
      bgGrad.addColorStop(0.35, "#04091a");
      bgGrad.addColorStop(1, "#050c1c");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Zone nebula tint (subtle atmospheric change per zone)
      if (!reducedSensoryMode) {
        const nebGrad = ctx.createRadialGradient(W * 0.5, horizonY, 0, W * 0.5, H * 0.4, W * 0.7);
        nebGrad.addColorStop(0, zoneColor.nebula);
        nebGrad.addColorStop(1, "transparent");
        ctx.fillStyle = nebGrad;
        ctx.fillRect(0, 0, W, H);
      }

      const scenarioVariant = scenarioVariantRef.current;
      if (!reducedSensoryMode) {
        if (scenarioVariant === "aurora") {
          const aurora = ctx.createLinearGradient(0, H * 0.08, W, H * 0.36);
          aurora.addColorStop(0, "rgba(90,220,255,0.14)");
          aurora.addColorStop(0.5, "rgba(120,120,255,0.08)");
          aurora.addColorStop(1, "rgba(70,255,190,0.12)");
          ctx.fillStyle = aurora;
          ctx.fillRect(0, 0, W, H * 0.56);
        } else if (scenarioVariant === "crimson") {
          const nebula = ctx.createRadialGradient(W * 0.76, H * 0.2, 2, W * 0.76, H * 0.2, H * 0.58);
          nebula.addColorStop(0, "rgba(255,150,115,0.16)");
          nebula.addColorStop(0.55, "rgba(255,80,70,0.12)");
          nebula.addColorStop(1, "rgba(20,6,10,0)");
          ctx.fillStyle = nebula;
          ctx.fillRect(0, 0, W, H);
        } else if (scenarioVariant === "binary") {
          const sunA = ctx.createRadialGradient(W * 0.18, H * 0.17, 2, W * 0.18, H * 0.17, H * 0.24);
          sunA.addColorStop(0, "rgba(255,230,170,0.34)");
          sunA.addColorStop(1, "rgba(255,220,170,0)");
          ctx.fillStyle = sunA;
          ctx.fillRect(0, 0, W, H);
          const sunB = ctx.createRadialGradient(W * 0.28, H * 0.13, 2, W * 0.28, H * 0.13, H * 0.17);
          sunB.addColorStop(0, "rgba(160,210,255,0.3)");
          sunB.addColorStop(1, "rgba(120,170,255,0)");
          ctx.fillStyle = sunB;
          ctx.fillRect(0, 0, W, H);
        }

        const planetGrad = ctx.createRadialGradient(W * 0.86, H * 0.78, H * 0.06, W * 0.86, H * 0.78, H * 0.32);
        planetGrad.addColorStop(0, "rgba(130,175,255,0.22)");
        planetGrad.addColorStop(0.6, "rgba(58,92,155,0.15)");
        planetGrad.addColorStop(1, "rgba(20,30,60,0)");
        ctx.fillStyle = planetGrad;
        ctx.beginPath();
        ctx.arc(W * 0.86, H * 0.78, H * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }

      // Zone transition flash
      if (zoneTransitionRef.current > 0 && !reducedSensoryMode) {
        ctx.fillStyle = `rgba(255,255,255,${zoneTransitionRef.current * 0.06})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Cosmic dust (far background layer) ──
      dustRef.current.forEach((d) => {
        d.y += dt * 4 * (0.1 + d.depth * 0.15);
        if (d.y > 1) d.y = 0;
        ctx.fillStyle = `rgba(150,180,255,${0.04 + d.depth * 0.06})`;
        ctx.fillRect(d.x * W, d.y * H, 1, 1);
      });

      // ── Star parallax (far layer — moves slower) ──
      layerBRef.current.forEach((s) => {
        const parallaxFactor = 0.12 + s.depth * 0.18; // slower = farther
        s.y += dt * baseSpeed * parallaxFactor * 45;
        s.twinkle += dt * 1.2;
        if (s.y > 1) s.y = 0;
        const twAlpha = 0.25 + s.depth * 0.35 + Math.sin(s.twinkle) * 0.08;
        ctx.fillStyle = `rgba(210,230,255,${twAlpha})`;
        ctx.fillRect(s.x * W, s.y * H, 0.8 + s.depth * 0.8, 0.8 + s.depth * 0.8);
      });

      // ── Star parallax (near layer — moves faster, creates depth) ──
      layerARef.current.forEach((s) => {
        const parallaxFactor = 0.35 + s.depth * 0.55;
        s.y += dt * baseSpeed * parallaxFactor * 45;
        s.twinkle += dt * 2;
        if (s.y > 1) s.y = 0;
        const twAlpha = 0.35 + s.depth * 0.4 + Math.sin(s.twinkle) * 0.1;
        ctx.fillStyle = `rgba(220,238,255,${twAlpha})`;
        ctx.fillRect(s.x * W, s.y * H, 1 + s.depth * 1.4, 1 + s.depth * 1.4);
      });

      // Speed streaks (proportional to boost)
      if (!reducedSensoryMode) {
        const streakCount = input.boost ? 22 : 12;
        const streakAlpha = input.boost ? 0.18 : 0.07;
        for (let i = 0; i < streakCount; i++) {
          const sx = ((i + 0.5) / streakCount) * W;
          const baseY = ((elapsedRef.current * 260 + i * 34) % (H + 60)) - 30;
          const len = 6 + baseSpeed * 22 * (input.boost ? 1.6 : 1);
          ctx.strokeStyle = `rgba(170,218,255,${streakAlpha + (i % 3) * 0.02})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, baseY);
          ctx.lineTo(sx, baseY + len);
          ctx.stroke();
        }
      }

      // ── Perspective lane guides ──
      ctx.strokeStyle = "rgba(122,208,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.moveTo(W * 0.12, playerY + 50); ctx.lineTo(vanishX, horizonY);
      ctx.moveTo(W * 0.88, playerY + 50); ctx.lineTo(vanishX, horizonY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizon glow
      const hGrad = ctx.createLinearGradient(0, horizonY - 10, 0, horizonY + 30);
      hGrad.addColorStop(0, "transparent");
      hGrad.addColorStop(0.5, `${zoneColor.accent.slice(0, 7)}1a`);
      hGrad.addColorStop(1, "transparent");
      ctx.fillStyle = hGrad;
      ctx.fillRect(0, horizonY - 10, W, 40);

      for (const e of entitiesRef.current) {
        if (e.kind !== "asteroid" || e.z < 1.02 || e.z > ENTITY_SPAWN_Z) continue;
        const markerX = vanishX + e.x * W * 0.12;
        const markerY = horizonY - 10;
        const markerAlpha = 0.22 + ((e.z - 1.02) / (ENTITY_SPAWN_Z - 1.02)) * 0.28;
        ctx.fillStyle = `rgba(255,150,105,${Math.max(0.18, Math.min(0.52, markerAlpha))})`;
        ctx.beginPath();
        ctx.moveTo(markerX, markerY - 6);
        ctx.lineTo(markerX - 4.8, markerY + 2.5);
        ctx.lineTo(markerX + 4.8, markerY + 2.5);
        ctx.closePath();
        ctx.fill();
      }

      if (!reducedSensoryMode && (wormholeStateRef.current === "open" || wormholeStateRef.current === "travel")) {
        const phase = wormholeStateRef.current === "travel"
          ? 1
          : Math.min(1, wormholeTimerRef.current / 3.2);
        const swirl = elapsedRef.current * 1.8;
        const coreX = vanishX + Math.sin(elapsedRef.current * 0.32) * 16;
        const coreY = horizonY + 12;
        const radius = 18 + phase * 38 + wormholeProgressRef.current * 30;

        const halo = ctx.createRadialGradient(coreX, coreY, 2, coreX, coreY, radius * 2.8);
        halo.addColorStop(0, `rgba(168,210,255,${0.30 + phase * 0.2})`);
        halo.addColorStop(0.45, `rgba(96,138,255,${0.18 + phase * 0.18})`);
        halo.addColorStop(1, "rgba(10,14,32,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(coreX, coreY, radius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        for (let ring = 0; ring < 4; ring += 1) {
          const ringR = radius * (0.7 + ring * 0.42 + Math.sin(swirl + ring * 1.5) * 0.05);
          ctx.strokeStyle = `rgba(132,194,255,${0.24 - ring * 0.05 + phase * 0.15})`;
          ctx.lineWidth = 1.4 - ring * 0.22;
          ctx.beginPath();
          ctx.ellipse(coreX, coreY, ringR * 1.16, ringR * 0.58, swirl * 0.2 + ring * 0.4, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(220,238,255,${0.18 + phase * 0.26})`;
        ctx.beginPath();
        ctx.arc(coreX, coreY, 3.5 + phase * 3.4, 0, Math.PI * 2);
        ctx.fill();

        if (wormholeStateRef.current === "travel") {
          const tunnelAlpha = 0.14 + wormholeProgressRef.current * 0.2;
          for (let i = 0; i < 16; i += 1) {
            const ang = (i / 16) * Math.PI * 2 + elapsedRef.current * 2.4;
            const x2 = coreX + Math.cos(ang) * (W * 0.7);
            const y2 = coreY + Math.sin(ang) * (H * 0.45);
            ctx.strokeStyle = `rgba(150,210,255,${tunnelAlpha * (1 - i / 20)})`;
            ctx.lineWidth = 1 + (i % 3) * 0.4;
            ctx.beginPath();
            ctx.moveTo(coreX, coreY);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
      }

      // ── Entities (sorted far → near) ──
      const sorted = [...entitiesRef.current].sort((a, b) => b.z - a.z);

      for (const e of sorted) {
        if (e.z > ENTITY_SPAWN_Z || e.z < -0.28) continue;
        const zFrac = Math.max(0, Math.min(1.1, (ENTITY_SPAWN_Z - e.z) / ENTITY_SPAWN_Z));
        const ey = horizonY + (playerY - horizonY) * zFrac;
        const perspective = Math.max(0.05, 1.35 - e.z);
        const ex = vanishX + e.x * W * 0.25 * perspective;
        const size = Math.max(3, e.radius * W * 0.40 * perspective);
        const alpha = Math.min(1, (ENTITY_SPAWN_Z - e.z) * 1.35);

        const dX = Math.abs(e.x - shipXRef.current);
        const dangerBand = e.radius + 0.22;
        const dangerLevel = (e.kind === "asteroid" && dX < dangerBand && e.z < 0.58 && e.z > 0)
          ? Math.max(0, 1 - dX / dangerBand) * Math.max(0, 1 - e.z / 0.58)
          : 0;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (e.kind === "beacon") {
          // Data beacon: hexagon + glow + pulse
          const pulse = 1 + Math.sin(elapsedRef.current * 4 + e.id) * 0.12;
          ctx.shadowColor = "#7adcff";
          ctx.shadowBlur = size * 2.5 * pulse;
          ctx.fillStyle = "#7adcff";
          ctx.strokeStyle = "#c0f0ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const bx = ex + Math.cos(a) * size;
            const by = ey + Math.sin(a) * size;
            i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Inner diamond
          ctx.fillStyle = "#e0f8ff";
          ctx.beginPath();
          ctx.moveTo(ex, ey - size * 0.45);
          ctx.lineTo(ex + size * 0.32, ey);
          ctx.lineTo(ex, ey + size * 0.45);
          ctx.lineTo(ex - size * 0.32, ey);
          ctx.closePath();
          ctx.fill();

        } else {
          // Asteroid: irregular polygon
          // Danger aura
          if (dangerLevel > 0.08 && !reducedSensoryMode) {
            const auraAlpha = dangerLevel * 0.28;
            const auraColor = dangerLevel > 0.6
              ? `rgba(255,70,50,${auraAlpha})`
              : `rgba(255,155,60,${auraAlpha})`;
            const aGrad = ctx.createRadialGradient(ex, ey, size * 0.4, ex, ey, size * 3.2);
            aGrad.addColorStop(0, auraColor);
            aGrad.addColorStop(1, "transparent");
            ctx.fillStyle = aGrad;
            ctx.beginPath();
            ctx.arc(ex, ey, size * 3.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Asteroid body
          const spinAngle = (e.spin ?? 0);
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(spinAngle);

          const astGrad = ctx.createRadialGradient(-size * 0.28, -size * 0.24, size * 0.1, 0, 0, size);
          if (dangerLevel > 0.6) {
            astGrad.addColorStop(0, "rgba(255,200,180,0.92)");
            astGrad.addColorStop(0.55, "rgba(170,85,60,0.90)");
            astGrad.addColorStop(1, "rgba(80,35,25,0.95)");
          } else if (dangerLevel > 0.15) {
            astGrad.addColorStop(0, "rgba(240,210,175,0.90)");
            astGrad.addColorStop(0.55, "rgba(148,108,75,0.88)");
            astGrad.addColorStop(1, "rgba(65,46,30,0.95)");
          } else {
            astGrad.addColorStop(0, "rgba(200,212,232,0.88)");
            astGrad.addColorStop(0.55, "rgba(110,126,158,0.88)");
            astGrad.addColorStop(1, "rgba(58,70,95,0.95)");
          }
          ctx.fillStyle = astGrad;

          if (e.polygon && e.polygon.length > 0) {
            ctx.beginPath();
            for (let i = 0; i < e.polygon.length; i += 1) {
              const angle = e.polygon[i] ?? 0;
              const r = size * (0.72 + (i % 3) * 0.09);
              const px = Math.cos(angle) * r;
              const py = Math.sin(angle) * r;
              i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
          }
          ctx.fill();

          // Rim light (facing the horizon)
          ctx.strokeStyle = dangerLevel > 0.5
            ? "rgba(255,130,80,0.32)"
            : "rgba(180,210,255,0.20)";
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.restore();

          // Danger arrow
          if (dangerLevel > 0.52 && e.z < 0.38 && !reducedSensoryMode) {
            const arrowAlpha = 0.5 + dangerLevel * 0.4;
            const arrowY = ey + size + 12;
            ctx.fillStyle = `rgba(255,65,50,${arrowAlpha})`;
            ctx.beginPath();
            ctx.moveTo(ex, arrowY + 9);
            ctx.lineTo(ex - 5.5, arrowY);
            ctx.lineTo(ex + 5.5, arrowY);
            ctx.closePath();
            ctx.fill();
          }
        }

        ctx.restore();
      }

      // ── Particles ──
      for (const p of particlesRef.current) {
        const lifeRatio = p.life / p.maxLife;
        ctx.globalAlpha = lifeRatio * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Ship ──
      const shipSX = vanishX + shipXRef.current * W * 0.25 * 1.3;
      const shipSY = playerY + 4;

      // Engine glow
      if (!reducedSensoryMode) {
        const glowRadius = input.boost ? 55 : 35;
        const glowGrad = ctx.createRadialGradient(shipSX, shipSY + 24, 2, shipSX, shipSY + 24, glowRadius);
        glowGrad.addColorStop(0, input.boost ? "rgba(100,160,255,0.55)" : "rgba(70,130,255,0.35)");
        glowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(shipSX, shipSY + 24, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Exhaust flame (animated)
      const flameLen = input.boost ? 48 : 28;
      const flamWobble = Math.sin(elapsedRef.current * 28) * 2;
      const flameGrad = ctx.createLinearGradient(shipSX, shipSY + 20, shipSX, shipSY + 20 + flameLen);
      flameGrad.addColorStop(0, input.boost ? "rgba(160,220,255,0.95)" : "rgba(120,180,255,0.85)");
      flameGrad.addColorStop(0.45, input.boost ? "rgba(80,140,255,0.65)" : "rgba(70,110,255,0.55)");
      flameGrad.addColorStop(1, "rgba(50,80,200,0)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(shipSX - 10, shipSY + 20);
      ctx.lineTo(shipSX + 10, shipSY + 20);
      ctx.lineTo(shipSX + flamWobble * 0.5, shipSY + 20 + flameLen);
      ctx.closePath();
      ctx.fill();

      // Secondary micro-thrusters
      if (input.boost && !reducedSensoryMode) {
        [-14, 14].forEach((offset) => {
          const mfGrad = ctx.createLinearGradient(shipSX + offset, shipSY + 14, shipSX + offset, shipSY + 30);
          mfGrad.addColorStop(0, "rgba(180,210,255,0.7)");
          mfGrad.addColorStop(1, "transparent");
          ctx.fillStyle = mfGrad;
          ctx.beginPath();
          ctx.moveTo(shipSX + offset - 4, shipSY + 14);
          ctx.lineTo(shipSX + offset + 4, shipSY + 14);
          ctx.lineTo(shipSX + offset + Math.sin(elapsedRef.current * 40) * 1.5, shipSY + 28);
          ctx.closePath();
          ctx.fill();
        });
      }

      // Lateral thrust indicators
      if ((input.left || input.right) && !reducedSensoryMode) {
        const dir = input.right ? -1 : 1;
        const tx = input.right ? shipSX - 18 : shipSX + 18;
        ctx.fillStyle = "rgba(122,208,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(tx, shipSY + 2);
        ctx.lineTo(tx, shipSY + 16);
        ctx.lineTo(tx + dir * 16, shipSY + 9);
        ctx.closePath();
        ctx.fill();
      }

      // Ship body (more detailed silhouette)
      ctx.fillStyle = "rgba(148,228,255,0.97)";
      ctx.beginPath();
      ctx.moveTo(shipSX, shipSY - 25);
      ctx.lineTo(shipSX + 8, shipSY - 8);
      ctx.lineTo(shipSX + 18, shipSY + 14);
      ctx.lineTo(shipSX + 8, shipSY + 10);
      ctx.lineTo(shipSX, shipSY + 16);
      ctx.lineTo(shipSX - 8, shipSY + 10);
      ctx.lineTo(shipSX - 18, shipSY + 14);
      ctx.lineTo(shipSX - 8, shipSY - 8);
      ctx.closePath();
      ctx.fill();

      // Wing accents
      ctx.fillStyle = "rgba(80,180,240,0.7)";
      ctx.beginPath();
      ctx.moveTo(shipSX + 10, shipSY + 5);
      ctx.lineTo(shipSX + 18, shipSY + 14);
      ctx.lineTo(shipSX + 8, shipSY + 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(shipSX - 10, shipSY + 5);
      ctx.lineTo(shipSX - 18, shipSY + 14);
      ctx.lineTo(shipSX - 8, shipSY + 10);
      ctx.closePath();
      ctx.fill();

      // Cockpit
      ctx.fillStyle = "rgba(210,245,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(shipSX, shipSY - 10, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hull damage ring
      if (collisionsRef.current > 0 && !reducedSensoryMode) {
        const hullFrac = 1 - collisionsRef.current / expeditionTuning.collisionLimit;
        const ringR = 30 + Math.sin(elapsedRef.current * 6) * 3;
        ctx.strokeStyle = `rgba(255,80,60,${0.38 * (1 - hullFrac) + 0.08})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(shipSX, shipSY - 4, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Overlay effects ──
      if (hitFlashRef.current > 0.01) {
        ctx.fillStyle = `rgba(255,40,30,${hitFlashRef.current * 0.30})`;
        ctx.fillRect(0, 0, W, H);
        // Vignette edge flash
        const vGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.72);
        vGrad.addColorStop(0, "transparent");
        vGrad.addColorStop(1, `rgba(255,40,30,${hitFlashRef.current * 0.5})`);
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, W, H);
      }

      if (beaconFlashRef.current > 0.01) {
        ctx.fillStyle = `rgba(80,220,255,${beaconFlashRef.current * 0.18})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (nearMissFlashRef.current > 0.01 && !reducedSensoryMode) {
        ctx.fillStyle = `rgba(255,200,80,${nearMissFlashRef.current * 0.12})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (threatPercent >= 65 && !reducedSensoryMode) {
        const tAlpha = ((threatPercent - 65) / 35) * 0.10;
        const tGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.68);
        tGrad.addColorStop(0, "transparent");
        tGrad.addColorStop(1, `rgba(255,90,40,${tAlpha})`);
        ctx.fillStyle = tGrad;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audio, emitParticles, expeditionTuning, finalizeRun, gamePhase, reducedSensoryMode, spawnEntity]);

  // ─── Derived values for UI ───────────────────────────────────────────────
  const loopProgress = Math.min(100, (runtime.elapsed / DURATION_SECONDS) * 100);
  const finalReport = finishedReport ?? (gamePhase === "finished"
    ? {
      id: "exp-fallback",
      createdAt: new Date().toISOString(),
      distance: Math.round(runtime.distance),
      dataShards: runtime.beacons,
      collisions: runtime.collisions,
      score: Math.round(scoreRun(runtime.distance, runtime.beacons, runtime.collisions, runtime.zone) * expeditionTuning.scoreMultiplier),
      outcome: runtime.collisions >= expeditionTuning.collisionLimit ? "failure" : "success",
      hint: profileHint(runtime.distance, runtime.beacons, runtime.collisions, expeditionTuning.collisionLimit),
      failureReason: runtime.collisions >= expeditionTuning.collisionLimit ? "hullBreach" : "missionIncomplete",
    } satisfies ExpeditionReport
    : null);
  const suggestedLabel = finalReport ? t(`expedition.hint.${finalReport.hint}`) : null;
  const isSuccess = finalReport?.outcome === "success";
  const reachedZone = finalReport ? getZone(finalReport.distance / 85) : "entry";
  const beaconObjectiveReached = (finalReport?.dataShards ?? 0) >= expeditionTuning.targetBeacons;
  const failureReasonLabel =
    finalReport?.failureReason === "hullBreach"
      ? t("expedition.failure.hullBreach")
      : t("expedition.failure.missionIncomplete");

  return (
    <section className="grid gap-4">
      {/* Header */}
      <header className="depth-panel flex items-center justify-between rounded-[24px] border border-white/16 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("expedition.eyebrow")}</p>
          <h2 className="font-display text-2xl text-ink-strong">{t("expedition.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("expedition.subtitle")}</p>
        </div>
        <Telescope className="h-6 w-6 text-accent-sky" />
      </header>

      {/* Mission briefing strip (always visible) */}
      {gamePhase !== "running" ? (
        <article className="mission-loop-board">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.objective")}</p>
          <p className="mt-1 text-sm text-ink-normal">{t("expedition.objectiveBody")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="mission-loop-step mission-loop-step--current">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.controls")}</p>
              <p className="mt-1 text-sm text-ink-normal">{t("expedition.controlsBody")}</p>
            </div>
            <div className={cn("mission-loop-step", gamePhase === "finished" && "mission-loop-step--done")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.rewards")}</p>
              <p className="mt-1 text-sm text-ink-normal">{t("expedition.rewardsBody")}</p>
            </div>
            <div className="mission-loop-step">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{t("expedition.loopLink")}</p>
              <p className="mt-1 text-sm text-ink-normal">{t("expedition.loopLinkBody")}</p>
            </div>
          </div>
        </article>
      ) : null}

      {/* Game area anchor */}
      <div ref={gameAreaRef}>
        <article
          className={cn(
            "depth-panel expedition-canvas-wrap",
            gamePhase === "running"
              ? "h-[72vh] min-h-[560px] overflow-hidden p-0"
              : "min-h-[520px] p-3"
          )}
        >

          {/* BRIEFING */}
          {gamePhase === "briefing" ? (
            <div className="grid min-h-[520px] max-h-[74vh] place-items-center overflow-y-auto rounded-[16px] border border-white/14 bg-black/26 p-6 text-center">
              <div className="max-w-lg pb-4">
                <Compass className="mx-auto h-8 w-8 text-accent-sky" />
                <h3 className="mt-3 font-display text-2xl text-ink-strong">{t("expedition.briefingTitle")}</h3>
                <p className="mt-2 text-sm text-ink-normal">{t("expedition.briefingBody")}</p>

                {/* Zone preview */}
                <div className="mt-5 grid grid-cols-3 gap-2 text-left">
                  {(["entry", "deepField", "extraction"] as MissionZone[]).map((z) => {
                    const zc = ZONE_COLORS[z];
                    const labels = { entry: "Entrada", deepField: "Campo Profundo", extraction: "Extração" };
                    const descs = {
                      entry: "Setor calmo. Oriente-se.",
                      deepField: "Densidade alta. Risco elevado.",
                      extraction: "Saída tensa. Recompensa máxima."
                    };
                    return (
                      <div key={z} className="rounded-xl border border-white/12 bg-black/24 p-3">
                        <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: zc.accent }}>{labels[z]}</p>
                        <p className="mt-1 text-xs text-ink-soft">{descs[z]}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Control diagram */}
                <div className="mt-5 flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="mx-auto grid grid-cols-3 gap-1 w-fit">
                      <div />
                      <div className="rounded border border-accent-sky/30 bg-accent-sky/10 px-2 py-1 text-[10px] text-accent-sky font-mono">W↑</div>
                      <div />
                      <div className="rounded border border-white/20 bg-white/6 px-2 py-1 text-[10px] text-ink-normal font-mono">A←</div>
                      <div className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-ink-soft font-mono">·</div>
                      <div className="rounded border border-white/20 bg-white/6 px-2 py-1 text-[10px] text-ink-normal font-mono">→D</div>
                    </div>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">Mover</p>
                  </div>
                  <div className="text-center">
                    <div className="rounded border border-accent-amber/40 bg-accent-amber/10 px-4 py-1.5 text-[10px] text-accent-amber font-mono">ESPAÇO</div>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">Impulso</p>
                  </div>
                </div>

                <p className="mt-4 rounded-xl border border-accent-sky/25 bg-accent-sky/8 px-3 py-2 text-xs text-ink-normal">
                  Objetivo principal: sobreviver ate o fim da janela. Objetivo secundario: coletar pelo menos{" "}
                  <span className="text-ink-strong">{expeditionTuning.targetBeacons} balizas quanticas</span>.
                </p>

                {/* Tuning stats */}
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                    Controle: <span className="text-ink-strong">+{formatNumber((expeditionTuning.handling - 1) * 100, 0)}%</span>
                  </p>
                  <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                    Balizas: <span className="text-ink-strong">{formatNumber(expeditionTuning.beaconChance * 100, 0)}%</span>
                  </p>
                  <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                    Casco: <span className="text-ink-strong">{expeditionTuning.collisionLimit} impactos</span>
                  </p>
                  <p className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                    Meta: <span className="text-ink-strong">{expeditionTuning.targetBeacons} balizas</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startRun}
                  className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent-sky/60 bg-accent-sky/14 px-6 py-3 text-sm font-medium text-accent-sky transition hover:bg-accent-sky/22"
                >
                  <Play className="h-4 w-4" />
                  {t("expedition.start")}
                </button>
              </div>
            </div>
          ) : null}

          {/* RUNNING CANVAS */}
          {gamePhase === "running" ? (
            <canvas ref={canvasRef} className="h-full w-full rounded-none" />
          ) : null}

          {/* Zone announcement overlay */}
          {gamePhase === "running" && zoneAnnounce ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex justify-center">
              <div
                className="rounded-2xl border px-6 py-3 text-center backdrop-blur-sm"
                style={{
                  borderColor: `${ZONE_COLORS[zoneAnnounce.zone].accent}40`,
                  background: `linear-gradient(180deg, rgba(4,10,20,0.85), rgba(2,6,14,0.92))`
                }}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink-soft">Zona detectada</p>
                <p className="mt-1 font-display text-xl" style={{ color: ZONE_COLORS[zoneAnnounce.zone].accent }}>
                  {ZONE_COLORS[zoneAnnounce.zone].label}
                </p>
              </div>
            </div>
          ) : null}

          {/* In-flight HUD */}
          {gamePhase === "running" ? (
            <div className="pointer-events-none absolute left-4 top-4 right-4 z-20 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-white/14 bg-black/50 px-2.5 py-1.5 text-xs text-ink-normal backdrop-blur-sm">
                <span className="text-ink-soft">Dist. </span>{formatNumber(runtime.distance, 0)} km
              </div>
              <div className="rounded-xl border border-accent-sky/30 bg-black/50 px-2.5 py-1.5 text-xs text-accent-sky backdrop-blur-sm">
                Dados {runtime.beacons}/{expeditionTuning.targetBeacons}
              </div>
              <div className={cn(
                "rounded-xl border px-2.5 py-1.5 text-xs backdrop-blur-sm",
                runtime.hull < 40 ? "border-accent-red/55 bg-accent-red/22 text-accent-red"
                  : runtime.hull < 70 ? "border-accent-amber/45 bg-black/50 text-accent-amber"
                  : "border-accent-teal/35 bg-black/50 text-accent-teal"
              )}>
                Casco {runtime.hull}%
              </div>
              <div className="rounded-xl border border-white/14 bg-black/50 px-2.5 py-1.5 text-xs text-ink-normal backdrop-blur-sm">
                Tempo {Math.max(0, Math.ceil(DURATION_SECONDS - runtime.elapsed))}s
              </div>
              <div
                className="rounded-xl border px-2.5 py-1.5 text-xs backdrop-blur-sm"
                style={{
                  borderColor: `${ZONE_COLORS[currentZone].accent}40`,
                  color: ZONE_COLORS[currentZone].accent,
                  background: "rgba(0,0,0,0.5)"
                }}
              >
                Zona {ZONE_COLORS[currentZone].label}
              </div>
            </div>
          ) : null}

          {gamePhase === "running" && runtime.hull <= 35 ? (
            <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
              <div className="rounded-full border border-accent-red/55 bg-black/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent-red shadow-[0_0_24px_rgba(255,90,70,0.22)]">
                Casco critico: evite colisao imediata
              </div>
            </div>
          ) : null}

          {gamePhase === "running" && wormholeStateRef.current === "open" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center">
              <div className="rounded-full border border-accent-sky/55 bg-black/66 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-accent-sky">
                Buraco de minhoca detectado: alinhe no centro e impulsione
              </div>
            </div>
          ) : null}

          {gamePhase === "running" && wormholeStateRef.current === "travel" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex justify-center">
              <div className="rounded-full border border-accent-teal/55 bg-black/66 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-accent-teal">
                Transito gravitacional em curso
              </div>
            </div>
          ) : null}

          {/* FINISHED SCREEN */}
          {gamePhase === "finished" && finalReport ? (
            <div className={cn(
              "grid h-full min-h-[520px] place-items-center p-6 text-center rounded-[16px] border",
              isSuccess
                ? "border-accent-teal/35 bg-[linear-gradient(180deg,rgba(6,28,22,0.75),rgba(3,14,12,0.90))]"
                : "border-accent-red/35 bg-[linear-gradient(180deg,rgba(28,6,6,0.75),rgba(14,3,3,0.90))]"
            )}>
              <div className="max-w-lg">
                {isSuccess
                  ? <Sparkles className="mx-auto h-9 w-9 text-accent-teal" />
                  : <ShieldAlert className="mx-auto h-9 w-9 text-accent-red" />}

                <h3 className={cn("mt-3 font-display text-2xl", isSuccess ? "text-accent-teal" : "text-accent-red")}>
                  {isSuccess ? "Extração concluída" : "Missão interrompida"}
                </h3>

                {!isSuccess ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    Alcançou: <span style={{ color: ZONE_COLORS[reachedZone].accent }}>{ZONE_COLORS[reachedZone].label}</span>
                  </p>
                ) : null}

                <p className="mt-2 text-sm text-ink-normal">{t("expedition.reportBody")}</p>
                {!isSuccess ? (
                  <p className="mt-2 rounded-lg border border-accent-red/40 bg-accent-red/12 px-3 py-2 text-sm text-accent-red">
                    {failureReasonLabel}
                  </p>
                ) : null}
                {isSuccess ? (
                  <p className={cn(
                    "mt-2 rounded-lg border px-3 py-2 text-sm",
                    beaconObjectiveReached
                      ? "border-accent-teal/40 bg-accent-teal/12 text-accent-teal"
                      : "border-accent-amber/40 bg-accent-amber/12 text-accent-amber"
                  )}>
                    {beaconObjectiveReached
                      ? "Meta secundaria concluida: dados completos coletados."
                      : "Extracao concluida com dados parciais. Rode novamente para completar a meta secundaria."}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">Distância</p>
                    <p className="mt-1 text-base text-ink-strong">{formatNumber(finalReport.distance, 0)} km</p>
                  </div>
                  <div className="rounded-xl border border-accent-sky/25 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">Balizas coletadas</p>
                    <p className="mt-1 text-base text-accent-sky">{finalReport.dataShards}</p>
                  </div>
                  <div className={cn(
                    "rounded-xl border px-3 py-2.5",
                    finalReport.collisions >= expeditionTuning.collisionLimit
                      ? "border-accent-red/40 bg-accent-red/10"
                      : "border-white/14 bg-black/28"
                  )}>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">Impactos</p>
                    <p className={cn("mt-1 text-base", finalReport.collisions >= expeditionTuning.collisionLimit ? "text-accent-red" : "text-ink-strong")}>
                      {finalReport.collisions}/{expeditionTuning.collisionLimit}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">Pontuação</p>
                    <p className={cn("mt-1 text-base font-semibold", isSuccess ? "text-accent-teal" : "text-ink-strong")}>
                      {formatNumber(finalReport.score, 0)}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "mt-4 rounded-xl border px-4 py-2.5",
                  isSuccess ? "border-accent-teal/30 bg-accent-teal/[0.06]" : "border-accent-amber/30 bg-accent-amber/[0.06]"
                )}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">Diretiva sugerida</p>
                  <p className={cn("mt-1 text-sm font-medium", isSuccess ? "text-accent-teal" : "text-accent-amber")}>
                    {suggestedLabel}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={startRun}
                    className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-black/28 px-4 py-2 text-sm text-ink-normal transition hover:bg-white/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Nova run
                  </button>
                  <Link
                    to={`/dashboard?expeditionHint=${finalReport.hint}`}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                      isSuccess
                        ? "border-accent-teal/60 bg-accent-teal/12 text-accent-teal hover:bg-accent-teal/20"
                        : "border-accent-amber/60 bg-accent-amber/12 text-accent-amber hover:bg-accent-amber/20"
                    )}
                  >
                    <Zap className="h-4 w-4" />
                    {t("expedition.applyHint")}
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </article>
      </div>

      {/* Progress bars (running) */}
      {gamePhase === "running" ? (
        <div className="depth-panel grid gap-4 rounded-[20px] border border-white/14 p-4 md:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.14em] text-ink-soft">Janela de extração</span>
              <span className="text-ink-soft">{Math.round(loopProgress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${loopProgress}%`,
                  background: `linear-gradient(90deg, #4090c0, ${ZONE_COLORS[currentZone].accent})`
                }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.14em] text-ink-soft">Integridade do casco</span>
              <span className={runtime.hull < 40 ? "text-accent-red" : runtime.hull < 70 ? "text-accent-amber" : "text-accent-teal"}>
                {runtime.hull}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div
                className={cn("h-full rounded-full transition-[width]", runtime.hull < 40 ? "from-accent-red/90 to-accent-red/55" : runtime.hull < 70 ? "from-accent-amber/88 to-accent-amber/55" : "from-accent-teal/88 to-accent-sky/55", "bg-gradient-to-r")}
                style={{ width: `${runtime.hull}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.14em] text-ink-soft">Nível de ameaça</span>
              <span className={runtime.threat >= 70 ? "text-accent-red" : runtime.threat >= 40 ? "text-accent-amber" : "text-accent-teal"}>
                {runtime.threat}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div
                className={cn("h-full rounded-full transition-[width]", runtime.threat >= 70 ? "from-accent-red/90 to-accent-red/55" : runtime.threat >= 40 ? "from-accent-amber/88 to-accent-amber/55" : "from-accent-teal/60 to-accent-teal/30", "bg-gradient-to-r")}
                style={{ width: `${runtime.threat}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Last report */}
      {latestReport && gamePhase !== "running" ? (
        <article className="rounded-[20px] border border-white/14 bg-black/22 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.lastReport")}</p>
          <p className="mt-1 text-sm text-ink-normal">
            {t("expedition.score")}: {formatNumber(latestReport.score, 0)} &nbsp;·&nbsp;
            {t("expedition.hintLabel")} {t(`expedition.hint.${latestReport.hint}`)}
          </p>
        </article>
      ) : null}
    </section>
  );
}
