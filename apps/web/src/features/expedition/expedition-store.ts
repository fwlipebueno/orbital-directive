import { useEffect, useState } from "react";

export type ExpeditionHint = "command" | "engineering" | "research" | "risk";
export type ExpeditionFailureReason = "hullBreach" | "missionIncomplete";

export interface ExpeditionReport {
  id: string;
  createdAt: string;
  distance: number;
  dataShards: number;
  collisions: number;
  score: number;
  outcome: "success" | "failure";
  hint: ExpeditionHint;
  nearMisses?: number | undefined;
  threatPeak?: number | undefined;
  extracted?: boolean | undefined;
  targetDistance?: number | undefined;
  targetShards?: number | undefined;
  failureReason?: ExpeditionFailureReason | undefined;
}

const storageKey = "orbital-directive-expedition-report";

export function readExpeditionReport(): ExpeditionReport | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ExpeditionReport;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.distance !== "number" ||
      typeof parsed.dataShards !== "number" ||
      typeof parsed.collisions !== "number" ||
      typeof parsed.score !== "number" ||
      (parsed.outcome !== "success" && parsed.outcome !== "failure")
    ) {
      return null;
    }
    if (!["command", "engineering", "research", "risk"].includes(parsed.hint)) {
      return null;
    }
    const nearMisses = typeof parsed.nearMisses === "number" ? Math.max(0, Math.round(parsed.nearMisses)) : undefined;
    const threatPeak = typeof parsed.threatPeak === "number" ? Math.max(0, Math.min(100, Math.round(parsed.threatPeak))) : undefined;
    const extracted = typeof parsed.extracted === "boolean" ? parsed.extracted : undefined;
    const targetDistance =
      typeof parsed.targetDistance === "number" ? Math.max(0, Math.round(parsed.targetDistance)) : undefined;
    const targetShards = typeof parsed.targetShards === "number" ? Math.max(0, Math.round(parsed.targetShards)) : undefined;
    const failureReason =
      parsed.failureReason === "hullBreach" || parsed.failureReason === "missionIncomplete"
        ? parsed.failureReason
        : undefined;

    return {
      ...parsed,
      nearMisses,
      threatPeak,
      extracted,
      targetDistance,
      targetShards,
      failureReason
    };
  } catch {
    return null;
  }
}

export function writeExpeditionReport(report: ExpeditionReport): void {
  localStorage.setItem(storageKey, JSON.stringify(report));
}

export function useExpeditionReport() {
  const [report, setReport] = useState<ExpeditionReport | null>(() => readExpeditionReport());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setReport(readExpeditionReport());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    report,
    setReport: (next: ExpeditionReport) => {
      writeExpeditionReport(next);
      setReport(next);
    }
  };
}
