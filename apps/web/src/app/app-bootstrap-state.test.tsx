import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StationState } from "@orbital/shared";
import { App } from "./App";
import { AppProviders } from "./providers";

type QueryStub<T> = {
  isLoading: boolean;
  data: T | undefined;
  error: unknown;
  refetch: () => Promise<unknown>;
};

type MutationStub = {
  isPending: boolean;
  mutateAsync: () => Promise<void>;
  error: unknown;
};

const useApiHealthMock = vi.fn<() => QueryStub<{ ok: true; ts: string }>>();
const useAuthSessionMock = vi.fn<() => QueryStub<{ user: { id: string; name: string; email: string; createdAt: string; isDemo: boolean }; preferences: { reducedSensoryMode: boolean; compactDensity: boolean } }>>();
const useStationStateMock = vi.fn<() => QueryStub<StationState>>();
const isUnauthorizedErrorMock = vi.fn<(error: unknown) => boolean>();
const useRefreshStationMock = vi.fn<() => () => Promise<void>>();
const useCommandStateMutationMock = vi.fn<() => MutationStub>();
const useOrbitalBurnMutationMock = vi.fn<() => MutationStub>();
const useEmergencyReserveMutationMock = vi.fn<() => MutationStub>();

const noopMutation = {
  isPending: false,
  mutateAsync: vi.fn(async () => undefined),
  error: null
};

vi.mock("../hooks/use-auth", () => ({
  useApiHealth: () => useApiHealthMock(),
  useAuthSession: () => useAuthSessionMock(),
  useLogoutMutation: () => noopMutation,
  useLoginMutation: () => noopMutation,
  useRegisterMutation: () => noopMutation,
  useDemoMutation: () => noopMutation
}));

vi.mock("../hooks/use-station", () => ({
  useStationState: () => useStationStateMock(),
  useRefreshStation: () => useRefreshStationMock(),
  useCommandStateMutation: () => useCommandStateMutationMock(),
  useOrbitalBurnMutation: () => useOrbitalBurnMutationMock(),
  useEmergencyReserveMutation: () => useEmergencyReserveMutationMock()
}));

vi.mock("../lib/errors", async () => {
  const actual = await vi.importActual<typeof import("../lib/errors")>("../lib/errors");
  return {
    ...actual,
    isUnauthorizedError: (error: unknown) => isUnauthorizedErrorMock(error)
  };
});

const defaultHealth: QueryStub<{ ok: true; ts: string }> = {
  isLoading: false,
  data: { ok: true, ts: new Date().toISOString() },
  error: null,
  refetch: async () => ({})
};

const authenticatedSession = {
  user: {
    id: "user-1",
    name: "Commander",
    email: "commander@example.com",
    createdAt: new Date().toISOString(),
    isDemo: false
  },
  preferences: {
    reducedSensoryMode: false,
    compactDensity: false
  }
};

const stationState: StationState = {
  stationId: "station-1",
  stationName: "Orbital Prime",
  version: 3,
  lastProcessedAt: new Date().toISOString(),
  resources: {
    energy: 120,
    oxygen: 97,
    water: 84,
    food: 76,
    credits: 980,
    research: 45,
    hullIntegrity: 92,
    morale: 88
  },
  modules: [
    { id: "m1", type: "reactor", level: 2, health: 94, isOnline: true },
    { id: "m2", type: "lifeSupport", level: 2, health: 91, isOnline: true }
  ],
  incidents: [],
  openIncidentCount: 0,
  logs: [
    {
      id: "l1",
      type: "event",
      message: "Telemetry synchronized.",
      createdAt: new Date().toISOString()
    }
  ],
  runSummary: {
    tickSeconds: 30,
    incidentCount: 0,
    criticalResources: [],
    severity: "normal"
  },
  missionTelemetry: {
    solarExposure: 0.74,
    orbitalStability: 82,
    thermalLoad: 33,
    hullPressure: 21,
    deltaVWindow: "open",
    operationalRisk: "low"
  },
  commandState: {
    powerProfile: "balanced",
    subsystemFocus: "balanced",
    thermalPolicy: "nominal",
    lastOrbitalBurnAt: null,
    lastReserveDeployAt: null,
    orbitalBurn: {
      ready: true,
      cooldownSecondsRemaining: 0,
      energyCost: 26,
      creditsCost: 180
    },
    emergencyReserve: {
      ready: true,
      cooldownSecondsRemaining: 0,
      creditsCost: 220
    }
  }
};

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>
  );
}

describe("App bootstrap states", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.setItem("orbital-directive-locale", "en-US");
    isUnauthorizedErrorMock.mockReset();
    useApiHealthMock.mockReturnValue(defaultHealth);
    useAuthSessionMock.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: null,
      refetch: async () => ({})
    });
    useStationStateMock.mockReturnValue({
      isLoading: false,
      data: stationState,
      error: null,
      refetch: async () => ({})
    });
    useRefreshStationMock.mockReturnValue(async () => undefined);
    useCommandStateMutationMock.mockReturnValue({ ...noopMutation, error: null });
    useOrbitalBurnMutationMock.mockReturnValue({ ...noopMutation, error: null });
    useEmergencyReserveMutationMock.mockReturnValue({ ...noopMutation, error: null });
  });

  it("shows backend unavailable when healthcheck fails", () => {
    useApiHealthMock.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error("connect ECONNREFUSED"),
      refetch: async () => ({})
    });

    renderApp();

    expect(screen.getByText(/Backend command channel unavailable/i)).toBeTruthy();
  });

  it("treats 401 auth.me as unauthenticated and renders login", () => {
    const unauthorizedError = new Error("401 Unauthorized");
    useAuthSessionMock.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: unauthorizedError,
      refetch: async () => ({})
    });
    isUnauthorizedErrorMock.mockImplementation((error) => error === unauthorizedError);

    renderApp();

    expect(screen.getByText(/Enter mission command/i)).toBeTruthy();
  });

  it("renders authenticated dashboard flow when session exists", () => {
    window.history.replaceState({}, "", "/dashboard");
    useAuthSessionMock.mockReturnValue({
      isLoading: false,
      data: authenticatedSession,
      error: null,
      refetch: async () => ({})
    });

    renderApp();

    expect(screen.getByText(/Mission control cycle/i)).toBeTruthy();
  });

  it("shows unexpected bootstrap error for non-401 auth failures", () => {
    const unexpectedError = new Error("schema parse failed");
    useAuthSessionMock.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: unexpectedError,
      refetch: async () => ({})
    });
    isUnauthorizedErrorMock.mockReturnValue(false);

    renderApp();

    expect(screen.getByText(/Unexpected bootstrap error/i)).toBeTruthy();
  });
});
