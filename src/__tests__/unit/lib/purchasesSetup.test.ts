import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

const {
  mockGetAppUserID,
  mockLogIn,
  mockGetCustomerInfo,
  mockIsAnonymous,
  mockLogOut,
} = vi.hoisted(() => ({
  mockGetAppUserID: vi.fn(),
  mockLogIn: vi.fn(),
  mockGetCustomerInfo: vi.fn(),
  mockIsAnonymous: vi.fn(),
  mockLogOut: vi.fn(),
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    getAppUserID: mockGetAppUserID,
    logIn: mockLogIn,
    getCustomerInfo: mockGetCustomerInfo,
    isAnonymous: mockIsAnonymous,
    logOut: mockLogOut,
  },
}));

import {
  ensurePurchasesUser,
  getProPackage,
  getPurchaseAccess,
  getWarpPackages,
  resetPurchasesUser,
  resolvePurchasesReady,
} from "@/lib/purchasesSetup";

function customerInfo(active: Record<string, unknown> = {}): CustomerInfo {
  return {
    entitlements: { active },
  } as unknown as CustomerInfo;
}

function purchasePackage(identifier: string): PurchasesPackage {
  return { identifier } as unknown as PurchasesPackage;
}

function offerings(): PurchasesOfferings {
  const lifetime = purchasePackage("$rc_lifetime");
  const monthly = purchasePackage("$rc_monthly");
  const annual = purchasePackage("$rc_annual");
  const fallback = purchasePackage("fallback");

  return {
    current: {
      identifier: "warp",
      availablePackages: [fallback],
    },
    all: {
      pro: {
        identifier: "pro",
        availablePackages: [lifetime],
        lifetime,
      },
      warp: {
        identifier: "warp",
        availablePackages: [monthly, annual],
        monthly,
        annual,
      },
    },
  } as unknown as PurchasesOfferings;
}

describe("purchasesSetup", () => {
  beforeAll(() => {
    resolvePurchasesReady();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAppUserID.mockResolvedValue({ appUserID: "anonymous" });
    mockLogIn.mockResolvedValue({ customerInfo: customerInfo() });
    mockGetCustomerInfo.mockResolvedValue({ customerInfo: customerInfo() });
    mockIsAnonymous.mockResolvedValue({ isAnonymous: false });
    mockLogOut.mockResolvedValue(undefined);
  });

  it("should select Pro only from the explicit Pro offering", () => {
    expect(getProPackage(offerings())?.identifier).toBe("$rc_lifetime");
  });

  it("should require both explicit Warp packages", () => {
    const result = getWarpPackages(offerings());

    expect(result?.monthly.identifier).toBe("$rc_monthly");
    expect(result?.annual.identifier).toBe("$rc_annual");
  });

  it("should parse lifetime and Warp access independently", () => {
    expect(
      getPurchaseAccess(
        customerInfo({ tapto_launcher: { id: "pro" }, warp: { id: "warp" } }),
      ),
    ).toEqual({ lifetimePro: true, warp: true });
    expect(getPurchaseAccess({} as unknown as CustomerInfo)).toEqual({
      lifetimePro: false,
      warp: false,
    });
  });

  it("should avoid logging in again when identity already matches", async () => {
    mockGetAppUserID.mockResolvedValue({ appUserID: "user-123" });
    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: customerInfo({ tapto_launcher: {} }),
    });

    const result = await ensurePurchasesUser("user-123");

    expect(mockLogIn).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
    expect(getPurchaseAccess(result).lifetimePro).toBe(true);
  });

  it("should log in with the requested account before returning info", async () => {
    await ensurePurchasesUser("user-456");

    expect(mockLogIn).toHaveBeenCalledWith({ appUserID: "user-456" });
  });

  it("should serialize account identity changes", async () => {
    let releaseFirstLogin!: (value: { customerInfo: CustomerInfo }) => void;
    mockLogIn
      .mockImplementationOnce(
        () =>
          new Promise<{ customerInfo: CustomerInfo }>((resolve) => {
            releaseFirstLogin = resolve;
          }),
      )
      .mockResolvedValueOnce({ customerInfo: customerInfo() });

    const first = ensurePurchasesUser("user-a");
    await vi.waitFor(() => {
      expect(mockLogIn).toHaveBeenCalledWith({ appUserID: "user-a" });
    });

    const second = ensurePurchasesUser("user-b");
    expect(mockGetAppUserID).toHaveBeenCalledTimes(1);

    releaseFirstLogin({ customerInfo: customerInfo() });
    await Promise.all([first, second]);

    expect(mockLogIn).toHaveBeenLastCalledWith({ appUserID: "user-b" });
    expect(mockLogIn.mock.invocationCallOrder[0]!).toBeLessThan(
      mockGetAppUserID.mock.invocationCallOrder[1]!,
    );
  });

  it("should skip logout when the current user is anonymous", async () => {
    mockIsAnonymous.mockResolvedValue({ isAnonymous: true });

    const result = await resetPurchasesUser();

    expect(mockLogOut).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
    expect(result).toEqual(customerInfo());
  });

  it("should ignore the expected anonymous logout error", async () => {
    mockLogOut.mockRejectedValue(
      new Error("Cannot log out anonymous app user"),
    );

    await expect(resetPurchasesUser()).resolves.toEqual(customerInfo());
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
  });

  it("should rethrow unexpected logout errors", async () => {
    const error = new Error("network unavailable");
    mockLogOut.mockRejectedValue(error);

    await expect(resetPurchasesUser()).rejects.toBe(error);
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  });
});
