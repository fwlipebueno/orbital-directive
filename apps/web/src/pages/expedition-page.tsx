import type { StationState } from "@orbital/shared";
import { Compass, Play, RotateCcw, ShieldAlert, Sparkles, Telescope, Zap } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Link } from "react-router-dom";
import { useUiPreferences } from "../app/ui-context";
import { useAudio } from "../features/audio/audio-provider";
import {
  type ExpeditionFailureReason,
  type ExpeditionHint,
  type ExpeditionReport,
  useExpeditionReport,
} from "../features/expedition/expedition-store";
import { useI18n } from "../i18n/i18n-provider";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";

// ─── Tipos ─────────────────────────────────────────────────────────────────
type GamePhase = "briefing" | "running" | "dying" | "syncing" | "finished";
type MissionZone = "entry" | "deepField" | "extraction";

interface Input { left: boolean; right: boolean; boost: boolean }

interface Entity {
  id: number;
  kind: "asteroid" | "beacon";
  x: number;   // -1..1
  z: number;   // 1.6=horizon  0=player
  radius: number;
  drift: number;
  poly: number[];  // pre-baked vertex angles
  spin: number;
}

interface Star { x: number; y: number; depth: number; twinkle: number; size: number }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }

// ─── Constantes ────────────────────────────────────────────────────────────
const RUN_DURATION   = 68;
const BASE_HITS      = 6;
const SPAWN_Z        = 1.58;
const HORIZON_Y      = 0.185;
const PLAYER_Y_FRAC  = 0.81;
const SAFE_SECS      = 14;
const HIT_IFRAMES    = 1.1;
const DEATH_DURATION = 0.55;
const WORM_START     = 22;   // seconds before wormhole opens
const WORM_OPEN      = 15;   // how long window stays
const WORM_TRAVEL    = 4.0;

// Zone thresholds by elapsed fraction
const Z_DEEP   = 0.30;
const Z_EXTR   = 0.70;

function zone(elapsed: number): MissionZone {
  const f = elapsed / RUN_DURATION;
  return f >= Z_EXTR ? "extraction" : f >= Z_DEEP ? "deepField" : "entry";
}

const ZONE_META = {
  entry:     { color: "#7ad0ff", nebula: "rgba(40,80,200,0.10)",  label: "Corredor de entrada"   },
  deepField: { color: "#c07aff", nebula: "rgba(100,40,160,0.16)", label: "Campo profundo"        },
  extraction:{ color: "#ff9060", nebula: "rgba(200,80,50,0.18)",  label: "Janela de extração"    },
} as const;

function makePolygon(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const base = (i / n) * Math.PI * 2;
    return base + (Math.random() - 0.5) * (Math.PI * 2 / n) * 0.44;
  });
}

function hint(dist: number, beacons: number, hits: number, limit: number): ExpeditionHint {
  if (hits >= limit)   return "risk";
  if (beacons >= 10)   return "research";
  if (hits >= 2)       return "engineering";
  if (dist >= 3400)    return "command";
  return "engineering";
}

function calcScore(dist: number, beacons: number, hits: number, z: MissionZone): number {
  const bonus = z === "extraction" ? 1.45 : z === "deepField" ? 1.12 : 1.0;
  return Math.max(0, Math.round((dist * 2.6 + beacons * 170 - hits * 190) * bonus));
}

// ─── Componente ────────────────────────────────────────────────────────────
export function ExpeditionPage({ station }: { station: StationState }): ReactElement {
  const audio             = useAudio();
  const { t }             = useI18n();
  const { reducedSensoryMode } = useUiPreferences();
  const { report: lastReport, setReport } = useExpeditionReport();

  const [phase,       setPhase]       = useState<GamePhase>("briefing");
  const [curZone,     setCurZone]     = useState<MissionZone>("entry");
  const [zoneFlash,   setZoneFlash]   = useState<{ z: MissionZone } | null>(null);
  const [hullPercent, setHullPercent] = useState(100);
  const [elapsed,     setElapsed]     = useState(0);
  const [beaconCount, setBeaconCount] = useState(0);
  const [threatPct,   setThreatPct]   = useState(0);
  const [distKm,      setDistKm]      = useState(0);
  const [hits,        setHits]        = useState(0);
  const [wormState,   setWormState]   = useState<"idle"|"open"|"travel"|"done">("idle");
  const [finishedReport, setFinishedReport] = useState<ExpeditionReport | null>(null);

  const gameAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number | null>(null);
  const resizeRef   = useRef<number | null>(null);

  // Mutable refs — all game state that must not cause re-renders per frame
  const R = useRef({
    elapsed:0, dist:0, beacons:0, hits:0,
    shipX:0, shipVx:0, spawnTick:0, prevZone:"entry" as MissionZone,
    hitIframe:0, deathTimer:0, nearMissCool:0,
    nearMissCount:0, threatPeak:0,
    hitFlash:0, shake:0, beaconFlash:0, nearFlash:0, zoneFlash:0,
    exhaustTick:0,
    wormState:"idle" as "idle"|"open"|"travel"|"done",
    wormTimer:0, wormProgress:0,
    scenePlanetAngle:0,
    resolved:false,
    pushTick:0,
  });
  const inputRef    = useRef<Input>({ left:false, right:false, boost:false });
  const starsA      = useRef<Star[]>([]);  // near
  const starsB      = useRef<Star[]>([]);  // far
  const dust        = useRef<Star[]>([]);
  const entities    = useRef<Entity[]>([]);
  const particles   = useRef<Particle[]>([]);
  const particleId  = useRef(0);
  const entityId    = useRef(0);

  // ─── Tuning ──────────────────────────────────────────────────────────────
  const tuning = useMemo(() => {
    const reactor   = station.modules.find(m => m.type === "reactor");
    const research  = station.modules.find(m => m.type === "researchLab");
    const repair    = station.modules.find(m => m.type === "repairBay");
    const crisis    = station.runSummary.severity === "crisis";
    const alert     = station.runSummary.severity === "alert";

    const handling = Math.max(0.82, 1
      + (reactor?.level ?? 1) * 0.04
      + (station.commandState.subsystemFocus === "integrity" ? 0.09 : 0)
      + (station.commandState.powerProfile === "shielded"   ? 0.06 : 0)
      - (crisis ? 0.11 : alert ? 0.04 : 0)
    );
    const beaconRate = Math.max(0.20, Math.min(0.54,
      0.24 + (research?.level ?? 1) * 0.03
      + (station.commandState.subsystemFocus === "research" ? 0.08 : 0)
    ));
    const spawnRate = Math.max(0.72, 1
      + (alert ? 0.07 : 0) + (crisis ? 0.16 : 0)
      - (station.commandState.powerProfile === "shielded" ? 0.06 : 0)
    );
    const hitLimit = Math.min(8, BASE_HITS
      + (station.commandState.powerProfile === "shielded" ? 1 : 0)
      + ((repair?.level ?? 1) >= 3 ? 1 : 0)
    );
    const scoreMul = 1 + (research?.level ?? 1) * 0.04
      + (station.commandState.subsystemFocus === "research" ? 0.08 : 0);
    const targetBeacons = Math.min(10, Math.max(4, 5 + (crisis ? 2 : alert ? 1 : 0)));

    return { handling, beaconRate, spawnRate, hitLimit, scoreMul, targetBeacons };
  }, [station]);

  // ─── Scroll lock ─────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (phase !== "running" && phase !== "dying") return;
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPos      = document.body.style.position;
    const prevTop      = document.body.style.top;
    const prevWidth    = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPos;
      document.body.style.top      = prevTop;
      document.body.style.width    = prevWidth;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "running" || phase === "syncing" || phase === "finished") {
      gameAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [phase]);

  // ─── Init starfield ───────────────────────────────────────────────────────
  const buildStarfield = useCallback(() => {
    const n = reducedSensoryMode ? 70 : 180;
    starsA.current = Array.from({ length: Math.floor(n * 0.35) }, () => ({
      x: Math.random(), y: Math.random(),
      depth: 0.05 + Math.random() * 0.28,
      twinkle: Math.random() * Math.PI * 2,
      size: 0.5 + Math.random() * 1.2,
    }));
    starsB.current = Array.from({ length: Math.floor(n * 0.65) }, () => ({
      x: Math.random(), y: Math.random(),
      depth: 0.35 + Math.random() * 0.65,
      twinkle: Math.random() * Math.PI * 2,
      size: 0.3 + Math.random() * 0.9,
    }));
    dust.current = Array.from({ length: reducedSensoryMode ? 30 : 90 }, () => ({
      x: Math.random(), y: Math.random(),
      depth: Math.random(), twinkle: 0, size: 1,
    }));
  }, [reducedSensoryMode]);

  // ─── Spawn entity ─────────────────────────────────────────────────────────
  const spawnEntity = useCallback((z: MissionZone, safe: boolean) => {
    if (entities.current.length > 38) return;
    const isBeacon = Math.random() < tuning.beaconRate;
    const densityScale = z === "deepField" ? 0.96 : z === "extraction" ? 1.14 : 0.68;
    const radius = isBeacon
      ? 0.048 + Math.random() * 0.012
      : 0.052 + Math.random() * 0.064 * densityScale * tuning.spawnRate;

    let sx = (Math.random() * 2 - 1) * 1.06;
    if (safe && !isBeacon) {
      for (let i = 0; i < 8; i++) {
        if (Math.abs(sx - R.current.shipX) >= 0.32) break;
        sx = (Math.random() * 2 - 1) * 1.06;
      }
    }
    entityId.current += 1;
    entities.current.push({
      id: entityId.current,
      kind: isBeacon ? "beacon" : "asteroid",
      x: sx, z: SPAWN_Z,
      radius,
      drift: (Math.random() * 2 - 1) * 0.14,
      poly: isBeacon ? [] : makePolygon(5 + Math.floor(Math.random() * 3)),
      spin: (Math.random() - 0.5) * 0.9,
    });
  }, [tuning.beaconRate, tuning.spawnRate]);

  // ─── Emit particles ───────────────────────────────────────────────────────
  const emit = useCallback((x: number, y: number, n: number, color: string, speed: number, life: number) => {
    const cap = reducedSensoryMode ? 100 : 280;
    if (particles.current.length > cap) return;
    const count = Math.min(n, reducedSensoryMode ? 7 : n);
    for (let i = 0; i < count; i++) {
      particleId.current += 1;
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed;
      particles.current.push({
        id: particleId.current,
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.55 + Math.random() * 0.45),
        maxLife: life, color, size: 1 + Math.random() * 2.8,
      });
    }
  }, [reducedSensoryMode]);

  // ─── Finalize run ─────────────────────────────────────────────────────────
  const finalize = useCallback((outcome: "success" | "failure", reason?: ExpeditionFailureReason) => {
    if (R.current.resolved) return;
    R.current.resolved = true;
    const z = zone(R.current.elapsed);
    const score = calcScore(R.current.dist, R.current.beacons, R.current.hits, z);
    const rep: ExpeditionReport = {
      id: `exp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      distance: Math.round(R.current.dist),
      dataShards: R.current.beacons,
      collisions: R.current.hits,
      nearMisses: R.current.nearMissCount,
      threatPeak: R.current.threatPeak,
      targetShards: tuning.targetBeacons,
      score: Math.round(score * tuning.scoreMul),
      outcome,
      hint: hint(R.current.dist, R.current.beacons, R.current.hits, tuning.hitLimit),
      extracted: outcome === "success",
      ...(outcome === "failure" ? { failureReason: reason ?? "hullBreach" } : {}),
    };
    setReport(rep);
    setFinishedReport(rep);
    audio.playEffect(outcome === "success" ? "confirm" : "emergency");
    setPhase("syncing");
  }, [audio, tuning, setReport]);

  // ─── Reset & start ────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    Object.assign(R.current, {
      elapsed:0, dist:0, beacons:0, hits:0,
      shipX:0, shipVx:0, spawnTick:0, prevZone:"entry",
      hitIframe:0, deathTimer:0, nearMissCool:0, nearMissCount:0, threatPeak:0,
      hitFlash:0, shake:0, beaconFlash:0, nearFlash:0, zoneFlash:0,
      exhaustTick:0, wormState:"idle", wormTimer:0, wormProgress:0,
      scenePlanetAngle:0, resolved:false, pushTick:0,
    });
    inputRef.current = { left:false, right:false, boost:false };
    entities.current  = [];
    particles.current = [];
    buildStarfield();
    setPhase("briefing"); // temporary — will immediately go to "running" in startRun
    setCurZone("entry");
    setZoneFlash(null);
    setHullPercent(100);
    setElapsed(0);
    setBeaconCount(0);
    setThreatPct(0);
    setDistKm(0);
    setHits(0);
    setWormState("idle");
  }, [buildStarfield]);

  const startRun = useCallback(() => {
    resetAll();
    audio.playEffect("transition");
    // small timeout so state flushes before starting loop
    window.setTimeout(() => {
      R.current.resolved = false;
      setFinishedReport(null);
      setPhase("running");
    }, 20);
  }, [audio, resetAll]);

  // ─── Keys ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const dn = (e: KeyboardEvent) => {
      if (["ArrowLeft","a","A"].includes(e.key)) { e.preventDefault(); inputRef.current.left=true; }
      if (["ArrowRight","d","D"].includes(e.key)){ e.preventDefault(); inputRef.current.right=true; }
      if (["ArrowUp","w","W"," "].includes(e.key)){ e.preventDefault(); inputRef.current.boost=true; }
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowLeft","a","A"].includes(e.key)) inputRef.current.left=false;
      if (["ArrowRight","d","D"].includes(e.key)) inputRef.current.right=false;
      if (["ArrowUp","w","W"," "].includes(e.key)) inputRef.current.boost=false;
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [phase]);

  // ─── Ambience ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "dying" || phase === "syncing") { audio.setAmbienceProfile("emergency"); return; }
    if (phase !== "running")                       { audio.setAmbienceProfile("command"); return; }
    if (threatPct >= 72 || hullPercent <= 30)      { audio.setAmbienceProfile("emergency"); return; }
    if (threatPct >= 42 || curZone === "extraction"){ audio.setAmbienceProfile("action"); return; }
    if (curZone === "deepField")                   { audio.setAmbienceProfile("risk"); return; }
    audio.setAmbienceProfile("command");
  }, [audio, phase, threatPct, hullPercent, curZone]);

  // ─── Zone flash cleanup ───────────────────────────────────────────────────
  useEffect(() => {
    if (!zoneFlash) return;
    const t = window.setTimeout(() => setZoneFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [zoneFlash]);

  // ─── Syncing → finished ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "syncing") return;
    const t = window.setTimeout(() => setPhase("finished"), 1100);
    return () => window.clearTimeout(t);
  }, [phase]);

  // ─── Main game loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const active = phase === "running" || phase === "dying";
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const syncSize = () => {
      const b = canvas.getBoundingClientRect();
      const w = Math.max(320, Math.floor(b.width));
      const h = Math.max(540, Math.floor(b.height));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };
    syncSize();
    const onResize = () => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(syncSize, 36);
    };
    window.addEventListener("resize", onResize);

    let lastTs = 0;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const rawDt = (ts - lastTs) / 1000;
      const dt = lastTs === 0 ? 0.016 : Math.max(0.006, Math.min(0.05, rawDt));
      lastTs = ts;

      const g  = R.current;
      const W  = canvas.width;
      const H  = canvas.height;
      const inp = inputRef.current;
      const dying  = phase === "dying";
      const active = phase === "running";
      const simDt  = dying ? dt * 0.38 : dt;

      // ── Cooldowns ──
      g.hitIframe     = Math.max(0, g.hitIframe - dt);
      g.nearMissCool  = Math.max(0, g.nearMissCool - dt);
      if (dying) { g.deathTimer = Math.max(0, g.deathTimer - dt); }

      // ── Physics ──
      const accel  = (inp.boost ? 3.4 : 2.6) * tuning.handling;
      const dir    = active ? (inp.left ? -1 : inp.right ? 1 : 0) : 0;
      if (dir !== 0) g.shipVx += dir * accel * dt;
      else g.shipVx *= Math.pow(dying ? 0.12 : 0.015, dt);
      const maxV = (inp.boost ? 1.85 : 1.15) * tuning.handling;
      g.shipVx = Math.max(-maxV, Math.min(maxV, g.shipVx));
      g.shipX  = Math.max(-1.1, Math.min(1.1, g.shipX + g.shipVx * dt));

      // ── Zone & speed ──
      const z         = zone(g.elapsed);
      const zSpeed    = z === "entry" ? 0.82 : z === "extraction" ? 1.38 : 1.18;
      const baseSpeed = dying ? 0.38 : (inp.boost ? 2.05 : 1.28) * zSpeed;

      if (active) {
        g.elapsed += dt;
        g.dist    += dt * baseSpeed * 88;
      }

      // ── Zone change ──
      if (z !== g.prevZone) {
        g.prevZone = z;
        g.zoneFlash = 1;
        setCurZone(z);
        setZoneFlash({ z });
        audio.playEffect(z === "extraction" ? "warning" : "transition");
      }

      // ── Wormhole state machine ──
      if (active && g.elapsed >= WORM_START && g.wormState === "idle") {
        g.wormState = "open";
        g.wormTimer = 0;
        setWormState("open");
        audio.playEffect("unlock");
      }
      if (active && g.wormState === "open") {
        g.wormTimer += dt;
        const canEnter = g.wormTimer > 1.4 && Math.abs(g.shipX) < 0.22 && (inp.boost || g.wormTimer > 4.2);
        if (canEnter) {
          g.wormState = "travel"; g.wormTimer = 0; g.wormProgress = 0;
          g.hitIframe = Math.max(g.hitIframe, 2.0);
          setWormState("travel");
          audio.playEffect("confirm");
        } else if (g.wormTimer >= WORM_OPEN) {
          g.wormState = "done"; setWormState("done");
        }
      }
      if (active && g.wormState === "travel") {
        g.wormProgress = Math.min(1, g.wormProgress + dt / WORM_TRAVEL);
        g.dist += dt * 200;
        g.hitIframe = Math.max(g.hitIframe, 1.5);
        if (g.wormProgress >= 1) {
          g.wormState = "done"; setWormState("done");
          g.elapsed = Math.max(g.elapsed, RUN_DURATION * 0.88);
          g.zoneFlash = 1;
          audio.playEffect("transition");
        }
      }

      // ── Spawn ──
      if (active && g.wormState !== "travel") {
        g.spawnTick += dt;
        const safeOpen = g.elapsed < SAFE_SECS;
        const baseInt  = reducedSensoryMode ? 1.02 : 0.78;
        const zScale   = z === "entry" ? 2.0 : z === "deepField" ? 1.22 : 0.98;
        const ramp     = Math.min(1, g.elapsed / 26);
        const interval = (baseInt * zScale / tuning.spawnRate) * (safeOpen ? 3.2 : 1.18 - ramp * 0.18);
        if (g.spawnTick >= interval) {
          spawnEntity(z, safeOpen);
          g.spawnTick = 0;
        }
      }

      // ── Entity update & collision ──
      const zAdvance = 1.18 + baseSpeed * 0.88;
      let threat = 0; let nearMiss = false;

      entities.current = entities.current.filter(e => {
        e.z -= simDt * zAdvance;
        e.x += e.drift * simDt;
        e.spin += simDt * 0.55;
        if (e.z < -0.32) return false;
        if (g.wormState === "travel" && e.kind === "asteroid") return false;

        const dx        = Math.abs(e.x - g.shipX);
        const beaconHit = e.kind === "beacon" ? (e.radius * 0.95 + 0.08) : 0;
        const astHit    = e.kind === "asteroid" ? (e.radius * 0.66 - 0.008) : 0;
        const hitR      = e.kind === "beacon" ? beaconHit : astHit;
        const inWindow  = e.kind === "beacon" ? (e.z < 0.18 && e.z > -0.08) : (e.z < 0.10 && e.z > -0.02);

        if (!dying && inWindow && dx < hitR) {
          if (e.kind === "beacon") {
            g.beacons += 1; g.beaconFlash = 1;
            audio.playEffect("confirm");
            const bx = W/2 + e.x*W*0.25, by = H*PLAYER_Y_FRAC - 18;
            emit(bx, by, 14, "#7adcff", 130, 0.52);
            setBeaconCount(g.beacons);
            return false;
          }
          if (g.hitIframe > 0) return false;
          g.hits += 1; g.hitFlash = Math.min(1, g.hitFlash + 0.94);
          g.shake = Math.min(1, g.shake + 0.90); g.hitIframe = HIT_IFRAMES;
          const sx = W/2 + g.shipX*W*0.25, sy = H*PLAYER_Y_FRAC;
          emit(sx, sy, 20, "#ff5030", 110, 0.70);
          g.threatPeak = 100;
          setHits(g.hits);
          const hullNow = Math.max(0, Math.round(100 - g.hits * (100 / tuning.hitLimit)));
          setHullPercent(hullNow);
          if (g.hits >= tuning.hitLimit) {
            emit(sx, sy, reducedSensoryMode ? 16 : 36, "#ff8050", 160, 1.2);
            g.deathTimer = DEATH_DURATION; g.hitIframe = DEATH_DURATION;
            setPhase("dying");
            audio.playEffect("emergency");
          } else { audio.playEffect("warning"); }
          return false;
        }

        // Near-miss
        if (!dying && e.kind === "asteroid" && dx < e.radius + 0.28 && e.z < 0.44 && e.z > 0) {
          const prox  = 1 - dx / (e.radius + 0.28);
          const depth = 1 - e.z / 0.44;
          threat = Math.max(threat, prox * depth);
          if (prox > 0.70 && e.z < 0.14 && dx > astHit) {
            nearMiss = true;
            g.nearFlash = Math.min(1, g.nearFlash + 0.38);
            if (g.nearMissCool <= 0) { g.nearMissCount += 1; g.nearMissCool = 0.26; }
          }
        }
        return true;
      });

      const threatPc = Math.max(0, Math.min(100, Math.round(threat * 100)));
      g.threatPeak = Math.max(g.threatPeak, threatPc);

      // ── End conditions ──
      if (active && g.elapsed >= RUN_DURATION) {
        cancelAnimationFrame(rafRef.current!);
        finalize("success");
        return;
      }
      if (dying && g.deathTimer <= 0) {
        cancelAnimationFrame(rafRef.current!);
        finalize("failure", "hullBreach");
        return;
      }

      // ── Exhaust particles ──
      g.exhaustTick += dt;
      const exInt = inp.boost ? 0.028 : 0.055;
      if (!dying && g.exhaustTick >= exInt && !reducedSensoryMode) {
        g.exhaustTick = 0;
        const sx = W/2 + g.shipX*W*0.25, sy = H*PLAYER_Y_FRAC + 20;
        particles.current.push({
          id: particleId.current++, x: sx+(Math.random()-0.5)*8, y: sy,
          vx: (Math.random()-0.5)*22, vy: 32+Math.random()*44,
          life: 0.28+Math.random()*0.24, maxLife:0.58,
          color: inp.boost ? "#70b8ff" : "#4080cc", size:1.4+Math.random()*2,
        });
      }

      // ── Update particles ──
      particles.current = particles.current.filter(p => {
        p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 55*dt; p.life -= dt;
        return p.life > 0;
      });

      // ── Decay ──
      g.hitFlash   = Math.max(0, g.hitFlash   - dt*(dying?1.1:2.6));
      g.shake      = Math.max(0, g.shake      - dt*(dying?1.2:4.8));
      g.beaconFlash= Math.max(0, g.beaconFlash- dt*4.2);
      g.nearFlash  = Math.max(0, g.nearFlash  - dt*3.0);
      g.zoneFlash  = Math.max(0, g.zoneFlash  - dt*0.65);
      g.scenePlanetAngle += dt * 0.006;

      // ── React state push (~10fps) ──
      g.pushTick += dt;
      if (g.pushTick > 0.10) {
        g.pushTick = 0;
        setElapsed(g.elapsed);
        setDistKm(g.dist);
        setThreatPct(threatPc);
      }

      // ══════════════════════════════════════════════════════════════════
      // R E N D E R I N G
      // ══════════════════════════════════════════════════════════════════
      const shAmt = g.shake * (reducedSensoryMode ? 0 : 9);
      const shX = shAmt*(Math.random()*2-1), shY = shAmt*(Math.random()*2-1);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(shX, shY);

      const hY  = H * HORIZON_Y;
      const pY  = H * PLAYER_Y_FRAC;
      const cX  = W * 0.5;
      const zm  = ZONE_META[z];

      // ── Deep space gradient ──────────────────────────────────────────
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0.00, "#010408");
      bg.addColorStop(0.28, "#030818");
      bg.addColorStop(0.68, "#040b1c");
      bg.addColorStop(1.00, "#050d1f");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // ── Zone nebula tint ─────────────────────────────────────────────
      if (!reducedSensoryMode) {
        const nb = ctx.createRadialGradient(cX, hY, 0, cX, H*0.42, W*0.75);
        nb.addColorStop(0, zm.nebula); nb.addColorStop(1, "transparent");
        ctx.fillStyle = nb; ctx.fillRect(0, 0, W, H);
      }

      // ── Background cosmic scene (per-zone) ───────────────────────────
      if (!reducedSensoryMode) {
        // Large gas giant — Interstellar-inspired
        const planetX = W * 0.84, planetY = H * 0.76;
        const planetR = H * 0.30;

        // Planet glow halo
        const pHalo = ctx.createRadialGradient(planetX, planetY, planetR*0.4, planetX, planetY, planetR*2.2);
        if (z === "entry") {
          pHalo.addColorStop(0, "rgba(100,140,220,0.22)");
          pHalo.addColorStop(0.5, "rgba(60,90,180,0.12)");
        } else if (z === "deepField") {
          pHalo.addColorStop(0, "rgba(130,80,200,0.24)");
          pHalo.addColorStop(0.5, "rgba(80,40,160,0.14)");
        } else {
          pHalo.addColorStop(0, "rgba(220,110,60,0.26)");
          pHalo.addColorStop(0.5, "rgba(160,70,40,0.14)");
        }
        pHalo.addColorStop(1, "transparent");
        ctx.fillStyle = pHalo;
        ctx.beginPath(); ctx.arc(planetX, planetY, planetR*2.2, 0, Math.PI*2); ctx.fill();

        // Planet body
        const pBody = ctx.createRadialGradient(
          planetX - planetR*0.28, planetY - planetR*0.22, planetR*0.08,
          planetX, planetY, planetR
        );
        if (z === "entry") {
          pBody.addColorStop(0.00, "rgba(130,170,240,0.88)");
          pBody.addColorStop(0.45, "rgba(55,85,170,0.86)");
          pBody.addColorStop(0.82, "rgba(30,48,110,0.90)");
          pBody.addColorStop(1.00, "rgba(12,20,55,0.92)");
        } else if (z === "deepField") {
          pBody.addColorStop(0.00, "rgba(180,120,240,0.88)");
          pBody.addColorStop(0.45, "rgba(90,45,170,0.86)");
          pBody.addColorStop(0.82, "rgba(50,22,100,0.90)");
          pBody.addColorStop(1.00, "rgba(18,8,44,0.92)");
        } else {
          pBody.addColorStop(0.00, "rgba(240,170,100,0.88)");
          pBody.addColorStop(0.45, "rgba(180,90,40,0.86)");
          pBody.addColorStop(0.82, "rgba(100,45,20,0.90)");
          pBody.addColorStop(1.00, "rgba(38,14,6,0.92)");
        }
        ctx.fillStyle = pBody;
        ctx.beginPath(); ctx.arc(planetX, planetY, planetR, 0, Math.PI*2); ctx.fill();

        // Atmospheric band
        ctx.fillStyle = z === "entry" ? "rgba(100,150,255,0.10)" :
                        z === "deepField" ? "rgba(180,100,255,0.10)" : "rgba(255,160,80,0.10)";
        ctx.beginPath();
        ctx.ellipse(planetX, planetY - planetR*0.1, planetR*0.96, planetR*0.18, 0, 0, Math.PI*2);
        ctx.fill();

        // Accretion ring (Interstellar-style)
        const ringTilt = 0.22;
        ctx.save();
        ctx.translate(planetX, planetY);
        ctx.rotate(g.scenePlanetAngle * 0.2 + 0.35);
        for (let r = 0; r < 4; r++) {
          const ro = planetR * (1.18 + r * 0.16);
          const alpha = (0.32 - r * 0.06) * (z === "entry" ? 1 : z === "deepField" ? 0.9 : 1.1);
          ctx.strokeStyle = z === "entry"
            ? `rgba(140,185,255,${alpha})`
            : z === "deepField"
            ? `rgba(200,150,255,${alpha})`
            : `rgba(255,190,120,${alpha})`;
          ctx.lineWidth = 2.4 - r * 0.4;
          ctx.beginPath();
          ctx.ellipse(0, 0, ro, ro * ringTilt, 0, 0, Math.PI*2);
          ctx.stroke();
        }
        ctx.restore();

        // Star cluster / nebula cloud
        const ncX = W * (z === "entry" ? 0.16 : z === "deepField" ? 0.22 : 0.12);
        const ncY = H * (z === "entry" ? 0.20 : z === "deepField" ? 0.18 : 0.15);
        for (let i = 0; i < (reducedSensoryMode ? 0 : 3); i++) {
          const nebR = H * (0.16 + i * 0.08);
          const neb = ctx.createRadialGradient(ncX, ncY, 0, ncX, ncY, nebR);
          if (z === "entry") {
            neb.addColorStop(0, `rgba(80,120,255,${0.14 - i*0.03})`);
            neb.addColorStop(0.5, `rgba(40,70,200,${0.08 - i*0.02})`);
          } else if (z === "deepField") {
            neb.addColorStop(0, `rgba(180,80,255,${0.16 - i*0.04})`);
            neb.addColorStop(0.5, `rgba(100,40,200,${0.09 - i*0.02})`);
          } else {
            neb.addColorStop(0, `rgba(255,140,60,${0.18 - i*0.04})`);
            neb.addColorStop(0.5, `rgba(220,80,40,${0.10 - i*0.02})`);
          }
          neb.addColorStop(1, "transparent");
          ctx.fillStyle = neb;
          ctx.beginPath(); ctx.arc(ncX, ncY, nebR, 0, Math.PI*2); ctx.fill();
        }

        // Stellar object / bright star (supergiant)
        const sgX = W * (z === "extraction" ? 0.18 : 0.08);
        const sgY = H * 0.14;
        const sgR = z === "extraction" ? 24 : 12;
        const sgCol = z === "extraction" ? "rgba(255,200,120," : "rgba(200,220,255,";
        const sg = ctx.createRadialGradient(sgX, sgY, 0, sgX, sgY, sgR*4);
        sg.addColorStop(0, sgCol + "0.95)");
        sg.addColorStop(0.15, sgCol + "0.55)");
        sg.addColorStop(0.5, sgCol + "0.16)");
        sg.addColorStop(1, "transparent");
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sgX, sgY, sgR*4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = sgCol + "1)";
        ctx.beginPath(); ctx.arc(sgX, sgY, sgR*0.55, 0, Math.PI*2); ctx.fill();

        // Lens flare cross (horizontal + vertical)
        if (z === "extraction") {
          ctx.strokeStyle = "rgba(255,210,140,0.20)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sgX - 60, sgY); ctx.lineTo(sgX + 60, sgY);
          ctx.moveTo(sgX, sgY - 40); ctx.lineTo(sgX, sgY + 40);
          ctx.stroke();
        }

        // Zone transition flash
        if (g.zoneFlash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${g.zoneFlash*0.055})`;
          ctx.fillRect(0, 0, W, H);
        }
      }

      // ── Cosmic dust ──────────────────────────────────────────────────
      dust.current.forEach(d => {
        d.y += dt * 3.5 * (0.08 + d.depth*0.14);
        if (d.y > 1) d.y = 0;
        ctx.fillStyle = `rgba(145,175,255,${0.03 + d.depth*0.05})`;
        ctx.fillRect(d.x*W, d.y*H, 1, 1);
      });

      // ── Stars — far layer (slow parallax) ───────────────────────────
      starsB.current.forEach(s => {
        s.y += dt * baseSpeed * (0.10 + s.depth*0.16) * 48;
        s.twinkle += dt * 1.1;
        if (s.y > 1) s.y = 0;
        const a = 0.22 + s.depth*0.32 + Math.sin(s.twinkle)*0.06;
        const sz = s.size * (0.7 + s.depth*0.5);
        ctx.fillStyle = `rgba(210,228,255,${a})`;
        ctx.fillRect(s.x*W, s.y*H, sz, sz);
      });

      // ── Stars — near layer (fast parallax → depth) ───────────────────
      starsA.current.forEach(s => {
        s.y += dt * baseSpeed * (0.32 + s.depth*0.52) * 48;
        s.twinkle += dt * 1.9;
        if (s.y > 1) s.y = 0;
        const a = 0.30 + s.depth*0.42 + Math.sin(s.twinkle)*0.09;
        const sz = s.size * (1 + s.depth*1.2);
        ctx.fillStyle = `rgba(225,240,255,${a})`;
        ctx.fillRect(s.x*W, s.y*H, sz, sz);
      });

      // ── Speed streaks ─────────────────────────────────────────────────
      if (!reducedSensoryMode) {
        const sc = inp.boost ? 26 : 14;
        const sa = inp.boost ? 0.20 : 0.06;
        for (let i = 0; i < sc; i++) {
          const sx = ((i+0.5)/sc)*W;
          const sy = ((g.elapsed*280 + i*38) % (H+60)) - 30;
          const len = 5 + baseSpeed*24*(inp.boost ? 1.7 : 1);
          ctx.strokeStyle = `rgba(165,215,255,${sa+(i%3)*0.018})`;
          ctx.lineWidth = 0.7; ctx.beginPath();
          ctx.moveTo(sx, sy); ctx.lineTo(sx, sy+len); ctx.stroke();
        }
      }

      // ── Perspective guides ────────────────────────────────────────────
      ctx.strokeStyle = "rgba(122,208,255,0.07)";
      ctx.lineWidth = 1; ctx.setLineDash([4,12]);
      ctx.beginPath();
      ctx.moveTo(W*0.10, pY+55); ctx.lineTo(cX, hY);
      ctx.moveTo(W*0.90, pY+55); ctx.lineTo(cX, hY);
      ctx.stroke(); ctx.setLineDash([]);

      // Horizon glow
      const hg = ctx.createLinearGradient(0, hY-12, 0, hY+36);
      hg.addColorStop(0, "transparent");
      hg.addColorStop(0.5, `${zm.color}1a`);
      hg.addColorStop(1, "transparent");
      ctx.fillStyle = hg; ctx.fillRect(0, hY-12, W, 48);

      // ── Incoming asteroid radar markers ───────────────────────────────
      entities.current.forEach(e => {
        if (e.kind !== "asteroid" || e.z < 1.05 || e.z > SPAWN_Z) return;
        const mx = cX + e.x*W*0.11;
        const a  = 0.15 + ((e.z-1.05)/(SPAWN_Z-1.05))*0.28;
        ctx.fillStyle = `rgba(255,140,90,${Math.min(0.52, a)})`;
        ctx.beginPath();
        ctx.moveTo(mx, hY-8); ctx.lineTo(mx-4.5, hY+2); ctx.lineTo(mx+4.5, hY+2);
        ctx.closePath(); ctx.fill();
      });

      // ── Wormhole ──────────────────────────────────────────────────────
      if (!reducedSensoryMode && (g.wormState === "open" || g.wormState === "travel")) {
        const traveling = g.wormState === "travel";
        const phase2  = traveling ? 1 : Math.min(1, g.wormTimer/3.0);
        const swirl   = g.elapsed * (traveling ? 4.5 : 1.9);
        const cwX = cX, cwY = hY + 14;
        const wR = 18 + phase2*48 + g.wormProgress*46;

        if (traveling) {
          const veil = ctx.createLinearGradient(0,0,0,H);
          veil.addColorStop(0, "rgba(10,16,40,0.75)");
          veil.addColorStop(0.5,"rgba(18,38,82,0.35)");
          veil.addColorStop(1, "rgba(2,7,18,0.80)");
          ctx.fillStyle = veil; ctx.fillRect(0,0,W,H);
          for (let i=0; i<48; i++) {
            const ratio = i/48;
            const ang = swirl + ratio*Math.PI*2;
            const reach = W*(0.16+ratio*0.90);
            ctx.strokeStyle = `rgba(148,208,255,${0.04+(1-ratio)*0.15})`;
            ctx.lineWidth = 1+(1-ratio)*3.4;
            ctx.beginPath();
            ctx.moveTo(cwX+Math.cos(ang)*wR*0.32, cwY+Math.sin(ang)*wR*0.14);
            ctx.lineTo(cwX+Math.cos(ang)*reach, cwY+Math.sin(ang)*(H*(0.10+ratio*0.44)));
            ctx.stroke();
          }
        }

        const whalo = ctx.createRadialGradient(cwX,cwY,2,cwX,cwY,wR*3.5);
        whalo.addColorStop(0, `rgba(210,235,255,${0.32+phase2*0.22})`);
        whalo.addColorStop(0.3,`rgba(110,158,255,${0.22+phase2*0.16})`);
        whalo.addColorStop(0.65,`rgba(80,50,158,${traveling?0.20:0.10})`);
        whalo.addColorStop(1, "rgba(8,12,30,0)");
        ctx.fillStyle = whalo; ctx.beginPath();
        ctx.arc(cwX,cwY,wR*3.5,0,Math.PI*2); ctx.fill();

        for (let r=0; r<6; r++) {
          const rr = wR*(0.60+r*0.32+Math.sin(swirl+r*1.4)*0.04);
          ctx.strokeStyle = `rgba(128,190,255,${0.16-r*0.018+phase2*0.16})`;
          ctx.lineWidth = Math.max(0.6, 1.6-r*0.2);
          ctx.beginPath();
          ctx.ellipse(cwX,cwY,rr*1.22,rr*0.52,swirl*0.14+r*0.36,0,Math.PI*2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(238,248,255,${0.22+phase2*0.32})`;
        ctx.beginPath(); ctx.arc(cwX,cwY, 3.5+phase2*5,0,Math.PI*2); ctx.fill();
      }

      // ── Entities (far→near) ───────────────────────────────────────────
      const sorted = entities.current.slice().sort((a,b) => b.z-a.z);

      for (const e of sorted) {
        if (e.z > SPAWN_Z || e.z < -0.30) continue;
        const zf   = Math.max(0, Math.min(1.1, (SPAWN_Z-e.z)/SPAWN_Z));
        const ey   = hY + (pY-hY)*zf;
        const persp = Math.max(0.04, 1.38-e.z);
        const ex   = cX + e.x*W*0.24*persp;
        const sz   = Math.max(3, e.radius*W*0.42*persp);
        const alp  = Math.min(1, (SPAWN_Z-e.z)*1.3);
        const dX   = Math.abs(e.x - g.shipX);
        const dangerB = e.radius + 0.24;
        const danLv = (e.kind==="asteroid" && dX<dangerB && e.z<0.60 && e.z>0)
          ? Math.max(0,1-dX/dangerB)*Math.max(0,1-e.z/0.60) : 0;

        ctx.save(); ctx.globalAlpha = alp;

        if (e.kind === "beacon") {
          const pulse = 1+Math.sin(g.elapsed*4+e.id)*0.14;
          ctx.shadowColor = "#7adcff"; ctx.shadowBlur = sz*2.8*pulse;
          ctx.fillStyle = "#7adcff"; ctx.strokeStyle = "#c4f4ff"; ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let i=0;i<6;i++){
            const a=(i/6)*Math.PI*2-Math.PI/2;
            i===0?ctx.moveTo(ex+Math.cos(a)*sz,ey+Math.sin(a)*sz):ctx.lineTo(ex+Math.cos(a)*sz,ey+Math.sin(a)*sz);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle="#e4faff"; ctx.shadowBlur=0;
          ctx.beginPath();
          ctx.moveTo(ex,ey-sz*0.46);ctx.lineTo(ex+sz*0.33,ey);
          ctx.lineTo(ex,ey+sz*0.46);ctx.lineTo(ex-sz*0.33,ey);
          ctx.closePath(); ctx.fill();
        } else {
          // Danger aura
          if (danLv > 0.06 && !reducedSensoryMode) {
            const ac = danLv>0.6 ? `rgba(255,68,46,${danLv*0.28})` : `rgba(255,152,58,${danLv*0.24})`;
            const ag = ctx.createRadialGradient(ex,ey,sz*0.4,ex,ey,sz*3.4);
            ag.addColorStop(0,ac); ag.addColorStop(1,"transparent");
            ctx.fillStyle=ag; ctx.beginPath(); ctx.arc(ex,ey,sz*3.4,0,Math.PI*2); ctx.fill();
          }
          // Asteroid body
          ctx.save(); ctx.translate(ex,ey); ctx.rotate(e.spin);
          const ag2 = ctx.createRadialGradient(-sz*0.28,-sz*0.22,sz*0.08,0,0,sz);
          if (danLv>0.58){
            ag2.addColorStop(0,"rgba(255,195,170,0.92)"); ag2.addColorStop(0.55,"rgba(165,80,55,0.90)"); ag2.addColorStop(1,"rgba(78,32,22,0.95)");
          } else if (danLv>0.14){
            ag2.addColorStop(0,"rgba(238,208,172,0.90)"); ag2.addColorStop(0.55,"rgba(144,104,70,0.88)"); ag2.addColorStop(1,"rgba(62,44,28,0.95)");
          } else {
            ag2.addColorStop(0,"rgba(196,210,230,0.88)"); ag2.addColorStop(0.55,"rgba(106,122,154,0.88)"); ag2.addColorStop(1,"rgba(55,66,90,0.95)");
          }
          ctx.fillStyle = ag2;
          if (e.poly.length > 0) {
            ctx.beginPath();
            e.poly.forEach((ang,i) => {
              const r = sz*(0.70+(i%3)*0.10);
              i===0?ctx.moveTo(Math.cos(ang)*r,Math.sin(ang)*r):ctx.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);
            }); ctx.closePath();
          } else { ctx.beginPath(); ctx.arc(0,0,sz,0,Math.PI*2); }
          ctx.fill();
          ctx.strokeStyle=danLv>0.5?"rgba(255,125,75,0.30)":"rgba(175,205,255,0.18)";
          ctx.lineWidth=0.9; ctx.stroke(); ctx.restore();
          // Warning arrow
          if (danLv>0.50 && e.z<0.40 && !reducedSensoryMode) {
            const ay=ey+sz+11;
            ctx.fillStyle=`rgba(255,60,46,${0.48+danLv*0.42})`;
            ctx.beginPath(); ctx.moveTo(ex,ay+9); ctx.lineTo(ex-5.5,ay); ctx.lineTo(ex+5.5,ay); ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
      }

      // ── Particles ─────────────────────────────────────────────────────
      for (const p of particles.current) {
        const lr = p.life/p.maxLife;
        ctx.globalAlpha = lr*0.84; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size*lr,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Ship ──────────────────────────────────────────────────────────
      const ssx = cX + g.shipX*W*0.24*1.32;
      const ssy = pY + 4;

      // Engine glow
      if (!reducedSensoryMode) {
        const gr = inp.boost ? 60 : 38;
        const eg = ctx.createRadialGradient(ssx,ssy+26,2,ssx,ssy+26,gr);
        eg.addColorStop(0, inp.boost?"rgba(100,165,255,0.58)":"rgba(68,128,255,0.36)");
        eg.addColorStop(1,"transparent");
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(ssx,ssy+26,gr,0,Math.PI*2); ctx.fill();
      }

      // Exhaust flame
      const fLen = inp.boost ? 52 : 30;
      const fWob = Math.sin(g.elapsed*30)*2.2;
      const fg   = ctx.createLinearGradient(ssx,ssy+22,ssx,ssy+22+fLen);
      fg.addColorStop(0, inp.boost?"rgba(165,225,255,0.96)":"rgba(115,178,255,0.86)");
      fg.addColorStop(0.45,inp.boost?"rgba(82,142,255,0.66)":"rgba(68,108,255,0.56)");
      fg.addColorStop(1,"rgba(48,78,200,0)");
      ctx.fillStyle=fg;
      ctx.beginPath(); ctx.moveTo(ssx-11,ssy+22); ctx.lineTo(ssx+11,ssy+22);
      ctx.lineTo(ssx+fWob*0.5,ssy+22+fLen); ctx.closePath(); ctx.fill();

      // Micro-thrusters on boost
      if (inp.boost && !reducedSensoryMode) {
        [-15,15].forEach(off => {
          const mg=ctx.createLinearGradient(ssx+off,ssy+15,ssx+off,ssy+30);
          mg.addColorStop(0,"rgba(185,215,255,0.72)"); mg.addColorStop(1,"transparent");
          ctx.fillStyle=mg;
          ctx.beginPath(); ctx.moveTo(ssx+off-4.5,ssy+15); ctx.lineTo(ssx+off+4.5,ssy+15);
          ctx.lineTo(ssx+off+Math.sin(g.elapsed*42)*1.6,ssy+30); ctx.closePath(); ctx.fill();
        });
      }

      // Lateral thrust
      if ((inp.left||inp.right) && !reducedSensoryMode) {
        const td = inp.right?-1:1, tx=inp.right?ssx-20:ssx+20;
        ctx.fillStyle="rgba(122,208,255,0.58)";
        ctx.beginPath(); ctx.moveTo(tx,ssy+2); ctx.lineTo(tx,ssy+17); ctx.lineTo(tx+td*17,ssy+9.5); ctx.closePath(); ctx.fill();
      }

      // Ship hull
      ctx.fillStyle="rgba(148,228,255,0.97)";
      ctx.beginPath();
      ctx.moveTo(ssx,ssy-26); ctx.lineTo(ssx+8,ssy-9);
      ctx.lineTo(ssx+19,ssy+15); ctx.lineTo(ssx+8,ssy+11);
      ctx.lineTo(ssx,ssy+17); ctx.lineTo(ssx-8,ssy+11);
      ctx.lineTo(ssx-19,ssy+15); ctx.lineTo(ssx-8,ssy-9);
      ctx.closePath(); ctx.fill();

      // Wing shading
      ctx.fillStyle="rgba(76,174,238,0.72)";
      ctx.beginPath(); ctx.moveTo(ssx+10,ssy+6); ctx.lineTo(ssx+19,ssy+15); ctx.lineTo(ssx+8,ssy+11); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ssx-10,ssy+6); ctx.lineTo(ssx-19,ssy+15); ctx.lineTo(ssx-8,ssy+11); ctx.closePath(); ctx.fill();

      // Cockpit
      ctx.fillStyle="rgba(210,246,255,0.92)";
      ctx.beginPath(); ctx.ellipse(ssx,ssy-10,5.8,8.2,0,0,Math.PI*2); ctx.fill();

      // Damage ring
      if (g.hits > 0 && !reducedSensoryMode) {
        const hr = 1-g.hits/tuning.hitLimit;
        const rr = 32+Math.sin(g.elapsed*6.5)*3.5;
        ctx.strokeStyle=`rgba(255,75,55,${0.40*(1-hr)+0.07})`;
        ctx.lineWidth=1.6; ctx.setLineDash([4,6]);
        ctx.beginPath(); ctx.arc(ssx,ssy-4,rr,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      }

      // ── Screen overlays ───────────────────────────────────────────────
      if (g.hitFlash > 0.01) {
        ctx.fillStyle=`rgba(255,36,26,${g.hitFlash*0.18})`; ctx.fillRect(0,0,W,H);
        const vg=ctx.createRadialGradient(W/2,H/2,H*0.18,W/2,H/2,H*0.70);
        vg.addColorStop(0,"transparent"); vg.addColorStop(1,`rgba(255,36,26,${g.hitFlash*0.24})`);
        ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
      }
      if (g.beaconFlash>0.01){ ctx.fillStyle=`rgba(75,218,255,${g.beaconFlash*0.17})`; ctx.fillRect(0,0,W,H); }
      if (g.nearFlash>0.01 && !reducedSensoryMode){ ctx.fillStyle=`rgba(255,198,75,${g.nearFlash*0.11})`; ctx.fillRect(0,0,W,H); }
      if (threatPc>=65 && !reducedSensoryMode){
        const tg=ctx.createRadialGradient(W/2,H/2,H*0.28,W/2,H/2,H*0.70);
        tg.addColorStop(0,"transparent"); tg.addColorStop(1,`rgba(255,88,38,${((threatPc-65)/35)*0.10})`);
        ctx.fillStyle=tg; ctx.fillRect(0,0,W,H);
      }
      if (dying) {
        const collapse=1-Math.max(0,g.deathTimer/DEATH_DURATION);
        ctx.fillStyle=`rgba(255,28,16,${0.14+collapse*0.20})`; ctx.fillRect(0,0,W,H);
        const cg=ctx.createRadialGradient(ssx,ssy,10,ssx,ssy,170+collapse*88);
        cg.addColorStop(0,`rgba(255,215,170,${0.14+collapse*0.16})`);
        cg.addColorStop(0.38,`rgba(255,106,64,${0.16+collapse*0.14})`);
        cg.addColorStop(1,"rgba(0,0,0,0)");
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(ssx,ssy,170+collapse*88,0,Math.PI*2); ctx.fill();
      }

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]); // intentionally minimal deps — all game state via refs

  // ─── Derived UI ───────────────────────────────────────────────────────────
  const progress  = Math.min(100, (elapsed / RUN_DURATION) * 100);
  const remaining = Math.max(0, Math.ceil(RUN_DURATION - elapsed));
  const isSuccess = finishedReport?.outcome === "success";
  const reachedZ  = finishedReport ? zone(finishedReport.distance / 88) : "entry";
  const beaconOk  = (finishedReport?.dataShards ?? 0) >= tuning.targetBeacons;
  const livePhase = phase === "running" || phase === "dying";

  const objectiveLine = (() => {
    if (wormState === "open")   return "Buraco de minhoca detectado — alinhe ao centro e use impulso";
    if (wormState === "travel") return "Trânsito gravitacional — campo limpo por alguns instantes";
    if (wormState === "done")   return "Corredor de extração aberto — sobreviva até o fim da janela";
    if (curZone === "entry")    return `Coletar ${tuning.targetBeacons} balizas e abrir rota`;
    if (curZone === "deepField") return "Cruzar o campo profundo — priorize a rota segura";
    return "Completar a janela de extração com os dados coletados";
  })();

  const hullLabel = (() => {
    const rem = tuning.hitLimit - hits;
    if (rem <= 1) return { text: `Ruptura iminente · 1 impacto`, cls: "text-accent-red" };
    if (rem <= 2) return { text: `Zona crítica · ${rem} impactos`, cls: "text-accent-amber" };
    if (hullPercent <= 55) return { text: `Sob pressão · ${rem} restantes`, cls: "text-accent-amber" };
    return { text: `Estável · ${rem} restantes`, cls: "text-accent-teal" };
  })();

  return (
    <section className="grid gap-4">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="depth-panel flex items-center justify-between rounded-[24px] border border-white/16 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">{t("expedition.eyebrow")}</p>
          <h2 className="font-display text-2xl text-ink-strong">{t("expedition.title")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("expedition.subtitle")}</p>
        </div>
        <Telescope className="h-6 w-6 text-accent-sky" />
      </header>

      {/* ─── Briefing strip (hidden during live play) ─────────────────── */}
      {!livePhase && phase !== "syncing" && phase !== "finished" ? (
        <article className="mission-loop-board">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.objective")}</p>
          <p className="mt-1 text-sm text-ink-normal">{t("expedition.objectiveBody")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { k: "controls", t: t("expedition.controls"), b: t("expedition.controlsBody"), cur: true, done: false },
              { k: "rewards",  t: t("expedition.rewards"),  b: t("expedition.rewardsBody"),  cur: false, done: !!finishedReport },
              { k: "loop",     t: t("expedition.loopLink"), b: t("expedition.loopLinkBody"), cur: false, done: false },
            ].map(s => (
              <div key={s.k} className={cn("mission-loop-step", s.cur && "mission-loop-step--current", s.done && "mission-loop-step--done")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{s.t}</p>
                <p className="mt-1 text-sm text-ink-normal">{s.b}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {/* ─── Game area ───────────────────────────────────────────────────── */}
      <div ref={gameAreaRef}>
        <article className={cn(
          "depth-panel expedition-canvas-wrap overflow-hidden",
          phase === "finished" || phase === "syncing" ? "min-h-[420px] p-0" : "min-h-[580px] p-3 sm:min-h-[660px]"
        )}>

          {/* BRIEFING */}
          {phase === "briefing" ? (
            <div className="grid min-h-[560px] place-items-center overflow-y-auto rounded-[16px] border border-white/14 bg-black/26 p-6 text-center">
              <div className="max-w-lg pb-4">
                <Compass className="mx-auto h-8 w-8 text-accent-sky" />
                <h3 className="mt-3 font-display text-2xl text-ink-strong">{t("expedition.briefingTitle")}</h3>
                <p className="mt-2 text-sm text-ink-normal">{t("expedition.briefingBody")}</p>

                {/* Zone cards */}
                <div className="mt-5 grid grid-cols-3 gap-2 text-left">
                  {(["entry","deepField","extraction"] as MissionZone[]).map(z => {
                    const m = ZONE_META[z];
                    const labels = { entry:"Entrada", deepField:"Campo Profundo", extraction:"Extração" };
                    const descs  = { entry:"Calmo. Aprenda o fluxo.", deepField:"Denso. Alta tensão.", extraction:"Tensa. Máxima recompensa." };
                    return (
                      <div key={z} className="rounded-xl border border-white/12 bg-black/24 p-3">
                        <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color:m.color }}>{labels[z]}</p>
                        <p className="mt-1 text-xs text-ink-soft">{descs[z]}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Controls */}
                <div className="mt-5 flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="mx-auto grid w-fit grid-cols-3 gap-1">
                      <div /><div className="rounded border border-accent-sky/30 bg-accent-sky/10 px-2 py-1 text-[10px] font-mono text-accent-sky">W↑</div><div />
                      <div className="rounded border border-white/20 bg-white/6 px-2 py-1 text-[10px] font-mono text-ink-normal">A←</div>
                      <div className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-mono text-ink-soft">·</div>
                      <div className="rounded border border-white/20 bg-white/6 px-2 py-1 text-[10px] font-mono text-ink-normal">→D</div>
                    </div>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">Mover</p>
                  </div>
                  <div className="text-center">
                    <div className="rounded border border-accent-amber/40 bg-accent-amber/10 px-4 py-1.5 text-[10px] font-mono text-accent-amber">ESPAÇO</div>
                    <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">Impulso</p>
                  </div>
                </div>

                {/* Objective callout */}
                <p className="mt-4 rounded-xl border border-accent-sky/22 bg-accent-sky/[0.07] px-3 py-2 text-xs text-ink-normal">
                  Meta principal: sobreviver até o fim da janela. Meta secundária: coletar{" "}
                  <span className="text-ink-strong">{tuning.targetBeacons} balizas quânticas</span>.
                </p>

                {/* Tuning & wormhole info */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Controle", `+${formatNumber((tuning.handling-1)*100,0)}%`],
                    ["Balizas",  `${formatNumber(tuning.beaconRate*100,0)}%`],
                    ["Casco",    `${tuning.hitLimit} impactos`],
                    ["Meta",     `${tuning.targetBeacons} balizas`],
                  ].map(([l,v]) => (
                    <p key={l} className="rounded-xl border border-white/12 bg-black/24 px-3 py-2 text-xs text-ink-normal">
                      {l}: <span className="text-ink-strong">{v}</span>
                    </p>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-accent-amber/28 bg-accent-amber/[0.07] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-accent-amber">Buraco de minhoca</p>
                  <p className="mt-1 text-xs text-ink-normal">
                    Surge durante a run. Alinhe ao centro da tela e use impulso para atravessar.
                    Limpa o campo por alguns segundos e avança a janela de extração.
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

          {/* CANVAS */}
          {livePhase ? (
            <canvas ref={canvasRef} className="block h-[580px] w-full rounded-[16px] sm:h-[660px]" />
          ) : null}

          {/* Zone announce */}
          {livePhase && zoneFlash ? (
            <div className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center">
              <div
                className="rounded-2xl border px-6 py-3 text-center backdrop-blur-sm"
                style={{ borderColor:`${ZONE_META[zoneFlash.z].color}40`, background:"linear-gradient(180deg,rgba(4,10,20,0.86),rgba(2,6,14,0.93))" }}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink-soft">Zona detectada</p>
                <p className="mt-1 font-display text-xl" style={{ color:ZONE_META[zoneFlash.z].color }}>
                  {ZONE_META[zoneFlash.z].label}
                </p>
              </div>
            </div>
          ) : null}

          {/* HUD — top */}
          {livePhase ? (
            <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <div className="rounded-xl border border-white/14 bg-black/52 px-2.5 py-1.5 text-xs text-ink-normal backdrop-blur-sm">
                <span className="text-ink-soft">km </span>{formatNumber(distKm,0)}
              </div>
              <div className="rounded-xl border border-accent-sky/30 bg-black/52 px-2.5 py-1.5 text-xs text-accent-sky backdrop-blur-sm">
                ◆ {beaconCount}/{tuning.targetBeacons}
              </div>
              <div className={cn("rounded-xl border bg-black/52 px-2.5 py-1.5 text-xs backdrop-blur-sm",
                hullPercent<40?"border-accent-red/55 text-accent-red":hullPercent<70?"border-accent-amber/45 text-accent-amber":"border-accent-teal/35 text-accent-teal")}>
                🛡 {hullPercent}%
              </div>
              <div className="rounded-xl border border-white/14 bg-black/52 px-2.5 py-1.5 text-xs text-ink-normal backdrop-blur-sm">
                ⏱ {remaining}s
              </div>
              <div className="rounded-xl border bg-black/52 px-2.5 py-1.5 text-xs backdrop-blur-sm"
                style={{ borderColor:`${ZONE_META[curZone].color}38`, color:ZONE_META[curZone].color }}>
                {ZONE_META[curZone].label}
              </div>
              <div className={cn("rounded-xl border bg-black/52 px-2.5 py-1.5 text-xs backdrop-blur-sm", hullLabel.cls.replace("text-","border-").replace("/","/")+"/30")}>
                <span className={hullLabel.cls}>{hullLabel.text}</span>
              </div>
            </div>
          ) : null}

          {/* Objective strip — bottom */}
          {livePhase ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
              <div className="max-w-2xl rounded-2xl border border-white/14 bg-black/62 px-4 py-2 text-center backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-soft">Objetivo atual</p>
                <p className="mt-0.5 text-sm font-medium text-ink-strong">{objectiveLine}</p>
              </div>
            </div>
          ) : null}

          {/* Critical hull warning */}
          {livePhase && hullPercent <= 50 ? (
            <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4">
              <div className={cn(
                "rounded-full border bg-black/74 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]",
                tuning.hitLimit-hits<=1 ? "border-accent-red/62 text-accent-red" : "border-accent-amber/55 text-accent-amber"
              )}>
                {tuning.hitLimit-hits<=1 ? "Próximo impacto encerra a missão" : `Casco crítico — ${tuning.hitLimit-hits} impactos restantes`}
              </div>
            </div>
          ) : null}

          {/* Death sequence */}
          {phase === "dying" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 flex justify-center px-4">
              <div className="rounded-full border border-accent-red/60 bg-black/76 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-accent-red">
                Casco colapsando · compilando telemetria da missão
              </div>
            </div>
          ) : null}

          {/* SYNCING — loading state after run ends */}
          {phase === "syncing" ? (
            <div className="grid min-h-[420px] place-items-center rounded-[16px] border border-white/14 bg-[linear-gradient(180deg,rgba(4,9,18,0.92),rgba(2,6,14,0.97))] p-8 text-center">
              <div className="max-w-sm w-full">
                <div className="mx-auto h-12 w-12 rounded-full border border-accent-sky/30 border-t-accent-sky/80 animate-spin" />
                <p className="mt-5 font-display text-xl text-ink-strong">Sincronizando dados da missão</p>
                <p className="mt-2 text-sm text-ink-soft">
                  Compilando telemetria, registrando inteligência de campo e preparando a diretiva de comando.
                </p>
                <div className="mt-6 h-1.5 overflow-hidden rounded-full border border-white/12 bg-white/[0.05]">
                  <div className="h-full animate-[expedition-sync_1.1s_ease-out_forwards] rounded-full bg-gradient-to-r from-accent-sky/72 via-accent-teal/80 to-accent-sky/72" />
                </div>
                <p className="mt-3 text-[10px] uppercase tracking-[0.20em] text-ink-soft">
                  Relatório de extração em preparação
                </p>
              </div>
            </div>
          ) : null}

          {/* FINISHED */}
          {phase === "finished" && finishedReport ? (
            <div className={cn(
              "grid min-h-[420px] place-items-center rounded-[16px] border p-6 text-center",
              isSuccess
                ? "border-accent-teal/35 bg-[linear-gradient(180deg,rgba(5,25,20,0.82),rgba(2,12,10,0.94))]"
                : "border-accent-red/35 bg-[linear-gradient(180deg,rgba(25,5,5,0.82),rgba(12,2,2,0.94))]"
            )}>
              <div className="max-w-md w-full">
                {isSuccess
                  ? <Sparkles className="mx-auto h-10 w-10 text-accent-teal" />
                  : <ShieldAlert className="mx-auto h-10 w-10 text-accent-red" />}

                <h3 className={cn("mt-3 font-display text-2xl", isSuccess?"text-accent-teal":"text-accent-red")}>
                  {isSuccess ? "Extração concluída" : "Missão interrompida"}
                </h3>

                {!isSuccess ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    Alcançou: <span style={{ color:ZONE_META[reachedZ].color }}>{ZONE_META[reachedZ].label}</span>
                  </p>
                ) : null}

                {/* Objective status */}
                {isSuccess ? (
                  <p className={cn("mt-3 rounded-xl border px-3 py-2 text-sm",
                    beaconOk?"border-accent-teal/38 bg-accent-teal/10 text-accent-teal":"border-accent-amber/38 bg-accent-amber/10 text-accent-amber")}>
                    {beaconOk
                      ? "Meta secundária atingida — dados completos coletados."
                      : "Dados parciais coletados. Nova run para completar a meta."}
                  </p>
                ) : (
                  <p className="mt-3 rounded-xl border border-accent-red/38 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    Casco atingiu o limite de impactos.
                  </p>
                )}

                {/* Stats grid */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Distância</p>
                    <p className="mt-1 text-sm text-ink-strong">{formatNumber(finishedReport.distance,0)} km</p>
                  </div>
                  <div className="rounded-xl border border-accent-sky/22 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Balizas</p>
                    <p className="mt-1 text-sm text-accent-sky">{finishedReport.dataShards}</p>
                  </div>
                  <div className={cn("rounded-xl border px-3 py-2.5",
                    finishedReport.collisions>=tuning.hitLimit?"border-accent-red/38 bg-accent-red/8":"border-white/14 bg-black/28")}>
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Impactos</p>
                    <p className={cn("mt-1 text-sm", finishedReport.collisions>=tuning.hitLimit?"text-accent-red":"text-ink-strong")}>
                      {finishedReport.collisions}/{tuning.hitLimit}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Pico ameaça</p>
                    <p className="mt-1 text-sm text-ink-strong">{finishedReport.threatPeak ?? 0}%</p>
                  </div>
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Quase-colisões</p>
                    <p className="mt-1 text-sm text-ink-strong">{finishedReport.nearMisses ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/14 bg-black/28 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.11em] text-ink-soft">Pontuação</p>
                    <p className={cn("mt-1 text-sm font-semibold", isSuccess?"text-accent-teal":"text-ink-strong")}>
                      {formatNumber(finishedReport.score,0)}
                    </p>
                  </div>
                </div>

                {/* Directive */}
                <div className={cn("mt-4 rounded-xl border px-4 py-3",
                  isSuccess?"border-accent-teal/28 bg-accent-teal/[0.06]":"border-accent-amber/28 bg-accent-amber/[0.06]")}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">Diretiva sugerida</p>
                  <p className={cn("mt-1 text-sm font-medium", isSuccess?"text-accent-teal":"text-accent-amber")}>
                    {t(`expedition.hint.${finishedReport.hint}`)}
                  </p>
                </div>

                {/* CTAs */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={startRun}
                    className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-black/28 px-4 py-2 text-sm text-ink-normal transition hover:bg-white/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Nova run
                  </button>
                  <Link
                    to={`/dashboard?expeditionHint=${finishedReport.hint}`}
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

      {/* ─── Progress bars (live only) ───────────────────────────────────── */}
      {livePhase ? (
        <div className="depth-panel grid gap-4 rounded-[20px] border border-white/14 p-4 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.13em] text-ink-soft">Janela de extração</span>
              <span className="text-ink-soft">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div className="h-full rounded-full transition-[width]"
                style={{ width:`${progress}%`, background:`linear-gradient(90deg,#3888b8,${ZONE_META[curZone].color})` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.13em] text-ink-soft">Integridade do casco</span>
              <span className={hullPercent<40?"text-accent-red":hullPercent<70?"text-accent-amber":"text-accent-teal"}>
                {hullPercent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div className={cn("h-full rounded-full bg-gradient-to-r transition-[width]",
                hullPercent<40?"from-accent-red/90 to-accent-red/55":hullPercent<70?"from-accent-amber/88 to-accent-amber/55":"from-accent-teal/88 to-accent-sky/55")}
                style={{ width:`${hullPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.13em] text-ink-soft">Nível de ameaça</span>
              <span className={threatPct>=70?"text-accent-red":threatPct>=42?"text-accent-amber":"text-accent-teal"}>{threatPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/14 bg-white/[0.06]">
              <div className={cn("h-full rounded-full bg-gradient-to-r transition-[width]",
                threatPct>=70?"from-accent-red/90 to-accent-red/55":threatPct>=42?"from-accent-amber/88 to-accent-amber/55":"from-accent-teal/58 to-accent-teal/28")}
                style={{ width:`${threatPct}%` }} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Last report chip ─────────────────────────────────────────────── */}
      {lastReport && !livePhase && phase !== "syncing" && phase !== "finished" ? (
        <article className="rounded-[20px] border border-white/14 bg-black/22 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{t("expedition.lastReport")}</p>
          <p className="mt-1 text-sm text-ink-normal">
            {t("expedition.score")}: {formatNumber(lastReport.score,0)} &nbsp;·&nbsp;
            {t("expedition.hintLabel")} {t(`expedition.hint.${lastReport.hint}`)}
          </p>
        </article>
      ) : null}
    </section>
  );
}
