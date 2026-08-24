import { afterEach, describe, expect, it, vi } from "vitest";

describe("purchase initialization readiness", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should keep purchasesReady pending until late configuration completes", async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const {
      purchasesReady,
      resolvePurchasesReadyAfterConfiguration,
      PurchasesTimeoutError,
    } = await import("@/lib/purchasesSetup");
    let resolveConfiguration!: () => void;
    const configuration = new Promise<void>((resolve) => {
      resolveConfiguration = resolve;
    });
    const onTimeout = vi.fn();
    let readinessResolved = false;
    void purchasesReady.then(() => {
      readinessResolved = true;
    });

    const initialization = resolvePurchasesReadyAfterConfiguration(
      configuration,
      onTimeout,
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(onTimeout).toHaveBeenCalledWith(expect.any(PurchasesTimeoutError));
    expect(readinessResolved).toBe(false);

    resolveConfiguration();
    await initialization;
    await purchasesReady;

    expect(readinessResolved).toBe(true);
  });
});
