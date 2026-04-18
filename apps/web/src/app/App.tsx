import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/app-shell";
import { BootstrapErrorScreen } from "../components/bootstrap-error-screen";
import { LoadingScreen } from "../components/loading-screen";
import { useAudio } from "../features/audio/audio-provider";
import { useApiHealth, useAuthSession, useLogoutMutation } from "../hooks/use-auth";
import { useStationState } from "../hooks/use-station";
import { useI18n } from "../i18n/i18n-provider";
import type { AuthMe } from "../lib/api";
import { getErrorMessage, isUnauthorizedError } from "../lib/errors";
import { useUiPreferences } from "./ui-context";

const DashboardPage = lazy(async () => import("../pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const DemoEntryPage = lazy(async () => import("../pages/demo-entry-page").then((module) => ({ default: module.DemoEntryPage })));
const ExpeditionPage = lazy(async () => import("../pages/expedition-page").then((module) => ({ default: module.ExpeditionPage })));
const IncidentsPage = lazy(async () => import("../pages/incidents-page").then((module) => ({ default: module.IncidentsPage })));
const LoginPage = lazy(async () => import("../pages/login-page").then((module) => ({ default: module.LoginPage })));
const LogsPage = lazy(async () => import("../pages/logs-page").then((module) => ({ default: module.LogsPage })));
const ModulesPage = lazy(async () => import("../pages/modules-page").then((module) => ({ default: module.ModulesPage })));
const ResearchPage = lazy(async () => import("../pages/research-page").then((module) => ({ default: module.ResearchPage })));
const RunSummaryPage = lazy(async () => import("../pages/run-summary-page").then((module) => ({ default: module.RunSummaryPage })));
const SettingsPage = lazy(async () => import("../pages/settings-page").then((module) => ({ default: module.SettingsPage })));

type AppBootstrapState =
  | "bootstrapping"
  | "backend-unavailable"
  | "unauthenticated"
  | "authenticated"
  | "unexpected-error";

function AuthenticatedRoutes({ authSession }: { authSession: AuthMe }) {
  const stationQuery = useStationState();
  const logoutMutation = useLogoutMutation();
  const audio = useAudio();
  const ui = useUiPreferences();
  const { t } = useI18n();

  useEffect(() => {
    const nextReduced = authSession.preferences.reducedSensoryMode;
    const nextDensity = authSession.preferences.compactDensity;

    if (ui.reducedSensoryMode !== nextReduced || ui.compactDensity !== nextDensity) {
      ui.setUiPreferences({
        reducedSensoryMode: nextReduced,
        compactDensity: nextDensity
      });
    }

    if (audio.settings.reducedSensoryMode !== nextReduced) {
      audio.updateSettings({
        reducedSensoryMode: nextReduced
      });
    }
  }, [authSession, ui, audio]);

  if (stationQuery.isLoading) {
    return <LoadingScreen label={t("loading.station")} />;
  }

  if (stationQuery.error && isUnauthorizedError(stationQuery.error)) {
    return <Navigate to="/login" replace />;
  }

  if (stationQuery.error) {
    return (
      <BootstrapErrorScreen
        title={t("bootstrap.stationOffline.title")}
        message={t("bootstrap.stationOffline.message")}
        details={getErrorMessage(stationQuery.error)}
        retryLabel={t("bootstrap.stationOffline.retry")}
        onRetry={async () => {
          await stationQuery.refetch();
        }}
      />
    );
  }

  if (!stationQuery.data) {
    return (
      <BootstrapErrorScreen
        title={t("bootstrap.stationSnapshot.title")}
        message={t("bootstrap.stationSnapshot.message")}
        retryLabel={t("bootstrap.stationSnapshot.retry")}
        onRetry={async () => {
          await stationQuery.refetch();
        }}
      />
    );
  }

  return (
    <div
      data-reduced-sensory={ui.reducedSensoryMode ? "true" : "false"}
      data-density={ui.compactDensity ? "compact" : "comfortable"}
      data-minimal-narrative={ui.minimalNarrativeMode ? "true" : "false"}
    >
      <AppShell
        station={stationQuery.data}
        userName={authSession.user.name}
        onLogout={async () => {
          await logoutMutation.mutateAsync().catch(() => undefined);
        }}
      >
        <Suspense fallback={<LoadingScreen label={t("loading.commandLink")} />}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage station={stationQuery.data} />} />
            <Route path="/expedition" element={<ExpeditionPage station={stationQuery.data} />} />
            <Route path="/modules" element={<ModulesPage station={stationQuery.data} />} />
            <Route path="/research" element={<ResearchPage station={stationQuery.data} />} />
            <Route path="/incidents" element={<IncidentsPage station={stationQuery.data} />} />
            <Route path="/logs" element={<LogsPage station={stationQuery.data} />} />
            <Route path="/run-summary" element={<RunSummaryPage station={stationQuery.data} />} />
            <Route path="/settings" element={<SettingsPage station={stationQuery.data} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </div>
  );
}

function UnauthenticatedRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/demo" element={<DemoEntryPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  const healthQuery = useApiHealth();
  const authQuery = useAuthSession({
    enabled: healthQuery.data?.ok === true
  });
  const { t } = useI18n();

  const bootstrapState: AppBootstrapState = (() => {
    if (healthQuery.isLoading) {
      return "bootstrapping";
    }

    if (healthQuery.error) {
      return "backend-unavailable";
    }

    if (authQuery.isLoading) {
      return "bootstrapping";
    }

    if (authQuery.error) {
      if (isUnauthorizedError(authQuery.error)) {
        return "unauthenticated";
      }

      return "unexpected-error";
    }

    if (authQuery.data) {
      return "authenticated";
    }

    return "unauthenticated";
  })();

  if (bootstrapState === "bootstrapping") {
    const label = healthQuery.isLoading ? t("loading.establishing") : t("loading.auth");
    return <LoadingScreen label={label} />;
  }

  if (bootstrapState === "backend-unavailable") {
    return (
      <BootstrapErrorScreen
        title={t("bootstrap.backendUnavailable.title")}
        message={t("bootstrap.backendUnavailable.message")}
        details={getErrorMessage(healthQuery.error)}
        retryLabel={t("bootstrap.backendUnavailable.retry")}
        onRetry={async () => {
          const healthResult = await healthQuery.refetch();
          if (healthResult.data?.ok) {
            await authQuery.refetch();
          }
        }}
      />
    );
  }

  if (bootstrapState === "unexpected-error") {
    return (
      <BootstrapErrorScreen
        title={t("bootstrap.unexpected.title")}
        message={t("bootstrap.unexpected.message")}
        details={getErrorMessage(authQuery.error)}
        retryLabel={t("bootstrap.unexpected.retry")}
        onRetry={async () => {
          await authQuery.refetch();
        }}
      />
    );
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      {bootstrapState === "unauthenticated" ? (
        <UnauthenticatedRoutes />
      ) : (
        <AuthenticatedRoutes authSession={authQuery.data!} />
      )}
    </BrowserRouter>
  );
}
