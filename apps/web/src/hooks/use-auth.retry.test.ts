import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldRetryAuthSession, shouldRetryHealthcheck } from "./use-auth";

const isUnauthorizedErrorMock = vi.fn<(error: unknown) => boolean>();
const isTransientErrorMock = vi.fn<(error: unknown) => boolean>();

vi.mock("../lib/errors", async () => {
  const actual = await vi.importActual<typeof import("../lib/errors")>("../lib/errors");
  return {
    ...actual,
    isUnauthorizedError: (error: unknown) => isUnauthorizedErrorMock(error),
    isTransientError: (error: unknown) => isTransientErrorMock(error)
  };
});

describe("auth/health retry policy", () => {
  beforeEach(() => {
    isUnauthorizedErrorMock.mockReset();
    isTransientErrorMock.mockReset();
  });

  it("never retries auth session on 401", () => {
    isUnauthorizedErrorMock.mockReturnValue(true);
    isTransientErrorMock.mockReturnValue(true);

    expect(shouldRetryAuthSession(0, new Error("401"))).toBe(false);
  });

  it("retries auth session only for transient failures", () => {
    isUnauthorizedErrorMock.mockReturnValue(false);
    isTransientErrorMock.mockReturnValue(true);

    expect(shouldRetryAuthSession(0, new Error("network"))).toBe(true);
    expect(shouldRetryAuthSession(1, new Error("network"))).toBe(true);
    expect(shouldRetryAuthSession(2, new Error("network"))).toBe(false);
  });

  it("does not retry auth session for non-transient errors", () => {
    isUnauthorizedErrorMock.mockReturnValue(false);
    isTransientErrorMock.mockReturnValue(false);

    expect(shouldRetryAuthSession(0, new Error("schema"))).toBe(false);
  });

  it("applies the same transient ceiling to healthcheck retries", () => {
    isTransientErrorMock.mockReturnValue(true);

    expect(shouldRetryHealthcheck(0, new Error("network"))).toBe(true);
    expect(shouldRetryHealthcheck(1, new Error("network"))).toBe(true);
    expect(shouldRetryHealthcheck(2, new Error("network"))).toBe(false);
  });
});
