import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useStationState() {
  return useQuery({
    queryKey: ["station", "current"],
    queryFn: () => api.currentStation(),
    refetchInterval: 20_000
  });
}

export function useRefreshStation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
    await queryClient.invalidateQueries({ queryKey: ["station", "runs"] });
  };
}

export function useModuleUpgradeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.upgradeModule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useModuleRepairMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.repairModule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useModuleToggleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.toggleModule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
    }
  });
}

export function useResolveIncidentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.resolveIncident,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useResearchPurchaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.purchaseResearch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "research"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useCommandStateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateCommandState,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useOrbitalBurnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.executeOrbitalBurn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "runs"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useEmergencyReserveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deployEmergencyReserve,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "runs"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "logs"] });
    }
  });
}

export function useRunSummaries(stationId?: string) {
  return useQuery({
    queryKey: ["station", "runs", stationId],
    queryFn: () => api.runSummaries(stationId ?? ""),
    enabled: Boolean(stationId)
  });
}

export function useStationLogs(stationId?: string) {
  return useQuery({
    queryKey: ["station", "logs", stationId],
    queryFn: () => api.listLogs(stationId ?? "", 120),
    enabled: Boolean(stationId)
  });
}

export function useResearchList(stationId?: string) {
  return useQuery({
    queryKey: ["station", "research", stationId],
    queryFn: () => api.listResearch(stationId ?? ""),
    enabled: Boolean(stationId)
  });
}
