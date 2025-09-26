import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { RestorePuchasesButton, useProPurchase } from '@/components/ProPurchase';
import { renderHook, act } from '@testing-library/react';

// Mock modules inline to avoid hoisting issues
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue('ios'),
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    restorePurchases: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('i18next', () => ({
  t: (key: string) => key,
}));

// Mock UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog" onClick={() => onOpenChange(false)}>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => (
    <h2 data-testid="dialog-title">{children}</h2>
  )
}));

vi.mock('@/components/wui/Button', () => ({
  Button: ({ label, onClick, disabled, className }: any) => (
    <button
      data-testid="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {label}
    </button>
  )
}));

describe('RestorePuchasesButton', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        reload: vi.fn(),
      },
      writable: true,
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render restore purchases button', () => {
    render(<RestorePuchasesButton />);

    const button = screen.getByTestId('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('settings.advanced.restorePurchases');
  });

  it('should handle successful restore with active entitlement', async () => {
    const mockCustomerInfo = {
      customerInfo: {
        entitlements: {
          active: {
            tapto_launcher: true
          }
        }
      }
    } as any;

    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    vi.mocked(Purchases.restorePurchases).mockResolvedValue({} as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    render(<RestorePuchasesButton />);

    const button = screen.getByTestId('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });

    const { Preferences } = await import('@capacitor/preferences');
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'launcherAccess',
      value: 'true'
    });

    expect(window.location.reload).toHaveBeenCalled();
  });

  it('should handle restore purchases failure', async () => {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    vi.mocked(Purchases.restorePurchases).mockRejectedValue(new Error('Restore failed'));

    render(<RestorePuchasesButton />);

    const button = screen.getByTestId('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
    });

    const toast = await import('react-hot-toast');
    expect(toast.default.error).toHaveBeenCalled();
  });
});

describe('useProPurchase', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default mock returns for the hook
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    vi.mocked(Purchases.getOfferings).mockResolvedValue({
      current: {
        availablePackages: []
      }
    } as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {}
        }
      }
    } as any);
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useProPurchase());

    expect(result.current.proAccess).toBe(false);
    expect(result.current.proPurchaseModalOpen).toBe(false);
    expect(typeof result.current.setProPurchaseModalOpen).toBe('function');
    expect(typeof result.current.PurchaseModal).toBe('function');
  });

  it('should initialize with custom initial pro access', () => {
    const { result } = renderHook(() => useProPurchase(true));

    expect(result.current.proAccess).toBe(true);
  });

  it('should skip initialization on web platform', async () => {
    const { Capacitor } = await import('@capacitor/core');
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');

    renderHook(() => useProPurchase());

    // Give it a moment to potentially make calls
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(Purchases.getOfferings).not.toHaveBeenCalled();
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it('should fetch offerings and customer info on mobile platforms', async () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios'); // Ensure non-web platform

    const mockOfferings = {
      current: {
        availablePackages: [
          {
            product: {
              priceString: '$6.99'
            }
          }
        ]
      }
    } as any;

    const mockCustomerInfo = {
      customerInfo: {
        entitlements: {
          active: {
            tapto_launcher: true
          }
        }
      }
    } as any;

    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    vi.mocked(Purchases.getOfferings).mockResolvedValue(mockOfferings);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    const { result } = renderHook(() => useProPurchase());

    await waitFor(() => {
      expect(Purchases.getOfferings).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
      expect(result.current.proAccess).toBe(true);
    });

    const { Preferences } = await import('@capacitor/preferences');
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'launcherAccess',
      value: 'true'
    });
  });

  it('should render PurchaseModal component', () => {
    const { result } = renderHook(() => useProPurchase());

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    // Modal should not be visible initially
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('should open purchase modal', () => {
    const { result } = renderHook(() => useProPurchase());

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText('scan.purchaseProTitle')).toBeInTheDocument();
  });
});