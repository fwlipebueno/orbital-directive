import { z } from "zod";
import {
  commandActionInputSchema,
  incidentResolveInputSchema,
  loginInputSchema,
  moduleRepairInputSchema,
  moduleToggleInputSchema,
  moduleUpgradeInputSchema,
  registerInputSchema,
  researchUpgradeInputSchema,
  updateCommandStateInputSchema,
  updatePreferencesInputSchema
} from "@orbital/shared";
import { authService } from "../modules/auth/auth.service";
import { incidentService } from "../modules/incidents/incident.service";
import { moduleService } from "../modules/modules/module.service";
import { researchService } from "../modules/research/research.service";
import { logService } from "../modules/stations/log.service";
import { stationService } from "../modules/stations/station.service";
import { userService } from "../modules/users/user.service";
import { clearSessionCookie, setSessionCookie } from "../security/cookies";
import { AppError } from "../utils/errors";
import { protectedProcedure, publicProcedure, router } from "./trpc";

const stationIdInput = z.object({
  stationId: z.string().min(1)
});

const resetStationInput = z.object({
  stationId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  confirmationText: z.literal("RESET")
});

const logsInput = z.object({
  stationId: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(60)
});

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, now: new Date().toISOString() })),

  auth: router({
    register: publicProcedure.input(registerInputSchema).mutation(async ({ input, ctx }) => {
      const result = await authService.register(input, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
      setSessionCookie(ctx.res, result.session.token, result.session.expiresAt);
      return {
        user: result.user
      };
    }),

    login: publicProcedure.input(loginInputSchema).mutation(async ({ input, ctx }) => {
      const result = await authService.login(input, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
      setSessionCookie(ctx.res, result.session.token, result.session.expiresAt);
      return {
        user: result.user
      };
    }),

    demoLogin: publicProcedure.mutation(async ({ ctx }) => {
      const result = await authService.demoLogin({
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
      setSessionCookie(ctx.res, result.session.token, result.session.expiresAt);
      return {
        user: result.user
      };
    }),

    me: protectedProcedure.query(async ({ ctx }) => {
      return authService.me(ctx.user.id);
    }),

    logout: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.sessionId) {
        throw new AppError("No active session", "NO_ACTIVE_SESSION", 400);
      }
      await authService.logout(ctx.sessionId);
      clearSessionCookie(ctx.res);
      return { ok: true };
    })
  }),

  stations: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      return stationService.getCurrentStationState(ctx.user.id);
    }),

    byId: protectedProcedure.input(stationIdInput).query(async ({ ctx, input }) => {
      return stationService.getStationState(input.stationId, ctx.user.id);
    }),

    runSummaries: protectedProcedure.input(stationIdInput).query(async ({ input, ctx }) => {
      return stationService.listRunSummaries(input.stationId, ctx.user.id);
    }),

    reset: protectedProcedure.input(resetStationInput).mutation(async ({ input, ctx }) => {
      return stationService.resetStation(ctx.user.id, input.stationId, input.idempotencyKey);
    }),

    updateCommandState: protectedProcedure.input(updateCommandStateInputSchema).mutation(async ({ input, ctx }) => {
      return stationService.updateCommandState(ctx.user.id, input, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    }),

    orbitalBurn: protectedProcedure.input(commandActionInputSchema).mutation(async ({ input, ctx }) => {
      return stationService.executeOrbitalBurn(ctx.user.id, input, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    }),

    deployReserve: protectedProcedure.input(commandActionInputSchema).mutation(async ({ input, ctx }) => {
      return stationService.deployEmergencyReserve(ctx.user.id, input, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    })
  }),

  modules: router({
    upgrade: protectedProcedure.input(moduleUpgradeInputSchema).mutation(async ({ input, ctx }) => {
      return moduleService.upgradeModule(ctx.user.id, input.stationId, input.moduleType, input.idempotencyKey, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    }),

    repair: protectedProcedure.input(moduleRepairInputSchema).mutation(async ({ input, ctx }) => {
      return moduleService.repairModule(ctx.user.id, input.stationId, input.moduleType, input.idempotencyKey, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    }),

    toggle: protectedProcedure.input(moduleToggleInputSchema).mutation(async ({ input, ctx }) => {
      return moduleService.toggleModule(ctx.user.id, input.stationId, input.moduleType, input.isOnline, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    })
  }),

  incidents: router({
    resolve: protectedProcedure.input(incidentResolveInputSchema).mutation(async ({ input, ctx }) => {
      return incidentService.resolveIncident(ctx.user.id, input.stationId, input.incidentId, input.idempotencyKey, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    })
  }),

  research: router({
    list: protectedProcedure.input(stationIdInput).query(async ({ input, ctx }) => {
      return researchService.listUpgrades(input.stationId, ctx.user.id);
    }),

    purchase: protectedProcedure.input(researchUpgradeInputSchema).mutation(async ({ input, ctx }) => {
      return researchService.purchaseUpgrade(ctx.user.id, input.stationId, input.upgradeKey, input.idempotencyKey, {
        ipAddress: ctx.clientIp,
        userAgent: ctx.userAgent
      });
    })
  }),

  logs: router({
    list: protectedProcedure.input(logsInput).query(async ({ input, ctx }) => {
      return logService.listStationLogs(ctx.user.id, input.stationId, input.limit);
    })
  }),

  users: router({
    updatePreferences: protectedProcedure.input(updatePreferencesInputSchema).mutation(async ({ input, ctx }) => {
        return userService.updatePreferences(ctx.user.id, input);
      })
  })
});

export type AppRouter = typeof appRouter;
