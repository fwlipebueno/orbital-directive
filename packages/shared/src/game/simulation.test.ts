import { describe, expect, it } from "vitest";
import { INITIAL_RESOURCES } from "../constants/game-balance";
import type { SimulationInput } from "../types/game";
import { simulateStationTick } from "./simulation";

const baseInput: SimulationInput = {
  resources: { ...INITIAL_RESOURCES },
  modules: [
    { id: "m1", type: "reactor", level: 1, health: 100, isOnline: true },
    { id: "m2", type: "lifeSupport", level: 1, health: 100, isOnline: true }
  ],
  activeIncidents: [],
  deltaSeconds: 0,
  nowMs: Date.now(),
  rng: () => 0.99
};

describe("simulateStationTick", () => {
  it("keeps resources stable when no time has elapsed", () => {
    const result = simulateStationTick(baseInput);
    expect(result.runSummary.tickSeconds).toBe(0);
    expect(result.resources).toEqual(baseInput.resources);
  });

  it("applies passive module resource changes", () => {
    const result = simulateStationTick({
      ...baseInput,
      deltaSeconds: 3600
    });
    expect(result.resources.energy).toBeGreaterThan(baseInput.resources.energy);
    expect(result.resources.water).toBeLessThan(baseInput.resources.water);
    expect(result.resources.oxygen).toBeGreaterThan(baseInput.resources.oxygen);
  });

  it("applies scarcity penalties when critical resources are depleted", () => {
    const result = simulateStationTick({
      ...baseInput,
      resources: {
        ...baseInput.resources,
        energy: 0,
        oxygen: 5
      },
      modules: [],
      deltaSeconds: 7200
    });
    expect(result.resources.hullIntegrity).toBeLessThan(baseInput.resources.hullIntegrity);
    expect(result.resources.morale).toBeLessThan(baseInput.resources.morale);
  });
});
