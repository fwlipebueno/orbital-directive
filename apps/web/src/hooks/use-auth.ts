import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { clearCsrfToken } from "../lib/csrf";
import { isTransientError, isUnauthorizedError } from "../lib/errors";

type UseAuthSessionOptions = {
  enabled?: boolean;
};

export function shouldRetryHealthcheck(failureCount: number, error: unknown): boolean {
  if (!isTransientError(error)) {
    return false;
  }

  return failureCount < 2;
}

export function shouldRetryAuthSession(failureCount: number, error: unknown): boolean {
  if (isUnauthorizedError(error)) {
    return false;
  }

  if (!isTransientError(error)) {
    return false;
  }

  return failureCount < 2;
}

export function useApiHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: () => api.health(),
    staleTime: 20_000,
    retry: shouldRetryHealthcheck
  });
}

export function useAuthSession(options?: UseAuthSessionOptions) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.me(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: shouldRetryAuthSession
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
    }
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
    }
  });
}

export function useDemoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.demoLogin(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["station", "current"] });
    }
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      clearCsrfToken();
      await queryClient.resetQueries({ queryKey: ["auth", "me"] });
      await queryClient.removeQueries({ queryKey: ["station"] });
    }
  });
}
