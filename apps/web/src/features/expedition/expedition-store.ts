import { useEffect, useState } from "react";

export type ExpeditionHint = "command" | "engineering" | "research" | "risk";

export interface ExpeditionReport {
  id: string;
  createdAt: string;
  distance: number;
  dataShards: number;
  collisions: number;
  score: number;
  outcome: "success" | "failure";
  hint: ExpeditionHint;
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
    return parsed;
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

