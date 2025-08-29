# Testing Infrastructure Plan for Zaparoo App
## React 19 + Vitest + TDD Implementation Guide (2025)

---

## 📋 Executive Summary

This document provides a comprehensive testing setup for the Zaparoo React/TypeScript/Capacitor app using Vitest with a pragmatic approach to Test-Driven Development (TDD). The strategy focuses on:

- **Minimal Mocking**: Only mock hardware APIs and external services
- **Real Logic Testing**: Test actual business logic, state management, and components
- **User-Focused Tests**: Test behavior that users experience
- **Gradual TDD Adoption**: Start with unit tests, evolve to integration
- **Performance**: Optimized for fast feedback loops

### Key Principles

1. **Mock Only What's Necessary**: Hardware dependencies, network calls, external APIs
2. **Test Real Implementation**: Zustand stores, React components, business logic
3. **User Behavior Focus**: Test what users do, not implementation details
4. **Strict TDD for New Code**: Write tests first for all new features
5. **Gradual Coverage**: Add tests for existing code over time

---

## 🔧 Dependencies and Configuration

### Required Packages

```json
{
  "devDependencies": {
    // Core Testing Framework
    "vitest": "^2.1.0",
    "@vitest/ui": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    
    // React Testing
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@testing-library/jest-dom": "^6.6.0",
    
    // DOM Environment (faster than jsdom)
    "happy-dom": "^15.11.0",
    
    // API/WebSocket Mocking
    "msw": "^2.6.0",
    
    // Test Data Generation
    "@faker-js/faker": "^9.2.0",
    
    // TDD Enforcement (optional)
    "husky": "^9.0.0",
    "lint-staged": "^15.2.0"
  }
}
```

### NPM Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:unit": "vitest --grep \"unit\"",
    "test:integration": "vitest --grep \"integration\"",
    "test:ci": "vitest --run --coverage",
    "test:changed": "vitest related"
  }
}
```

---

## ⚙️ Configuration Files

### vitest.config.ts

```typescript
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./src/test-setup.ts'],
      include: ['**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        exclude: [
          'node_modules/',
          'src/test-utils/',
          '*.config.ts',
          '**/*.d.ts',
          '**/*.gen.ts',
          'src/main.tsx',
          'src/routeTree.gen.ts'
        ]
      },
      // Performance: Use default threads (faster than forks)
      // pool: 'forks' removed for better performance
    }
  })
);
```

### src/test-setup.ts

```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';

// Auto cleanup after each test
afterEach(() => {
  cleanup();
  vi.restoreAllMocks(); // Restore mocks, not just clear
});

// Mock ONLY external dependencies and hardware APIs
// Use explicit factory functions since Vitest doesn't auto-resolve __mocks__
vi.mock('@capacitor/preferences', () => import('../__mocks__/@capacitor/preferences'));
vi.mock('@capacitor/app', () => import('../__mocks__/@capacitor/app'));
vi.mock('@capacitor/browser');
vi.mock('@capacitor/clipboard');
vi.mock('@capacitor/status-bar');
vi.mock('@capawesome-team/capacitor-nfc', () => import('../__mocks__/@capawesome-team/capacitor-nfc'));
vi.mock('@capacitor-mlkit/barcode-scanning');
vi.mock('@capacitor-community/keep-awake');
vi.mock('@revenuecat/purchases-capacitor');
vi.mock('@capacitor-firebase/authentication');

// Setup MSW for API/WebSocket mocking
import { setupServer } from 'msw/node';
import { handlers } from './test-utils/msw-handlers';

// Setup MSW server with handlers
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock Capacitor platform detection
vi.mock('@capacitor/core', async () => {
  const actual = await vi.importActual('@capacitor/core');
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      getPlatform: vi.fn(() => 'web'),
      isNativePlatform: vi.fn(() => false),
    },
  };
});

// Platform test helper
export const __setPlatform = (platform: 'web' | 'ios' | 'android') => {
  const { Capacitor } = require('@capacitor/core');
  vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(platform !== 'web');
  };
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

---

## 🎭 Strategic Mocking (Hardware/External Only)

### Capacitor Plugin Mocks

#### __mocks__/@capacitor/preferences.ts

```typescript
import { vi } from 'vitest';

const store = new Map<string, string>();

export const Preferences = {
  get: vi.fn(async ({ key }: { key: string }) => {
    return { value: store.get(key) || null };
  }),
  
  set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
    store.set(key, value);
  }),
  
  remove: vi.fn(async ({ key }: { key: string }) => {
    store.delete(key);
  }),
  
  clear: vi.fn(async () => {
    store.clear();
  }),
  
  // Test utilities
  __reset: () => store.clear(),
  __getStore: () => new Map(store)
};
```

#### __mocks__/@capawesome-team/capacitor-nfc.ts

```typescript
import { vi } from 'vitest';

const listeners = new Map<string, Function[]>();

export const Nfc = {
  isSupported: vi.fn().mockResolvedValue({ isSupported: true }),
  isEnabled: vi.fn().mockResolvedValue({ isEnabled: true }),
  startScanSession: vi.fn().mockResolvedValue(undefined),
  stopScanSession: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  
  addListener: vi.fn((event: string, callback: Function) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(callback);
    
    return {
      remove: vi.fn(() => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index > -1) eventListeners.splice(index, 1);
        }
      })
    };
  }),
  
  // Test utilities
  __simulateTagScanned: (tag: any) => {
    const eventListeners = listeners.get('nfcTagScanned') || [];
    eventListeners.forEach(callback => callback({ nfcTag: tag }));
  },
  
  __simulateError: (error: any) => {
    const eventListeners = listeners.get('scanError') || [];
    eventListeners.forEach(callback => callback(error));
  },
  
  __reset: () => {
    listeners.clear();
    vi.clearAllMocks();
  }
};
```

#### __mocks__/@capacitor/app.ts

```typescript
import { vi } from 'vitest';

const listeners = new Map<string, Function[]>();

export const App = {
  addListener: vi.fn((event: string, callback: Function) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event)!.push(callback);
    
    return {
      remove: vi.fn(() => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index > -1) eventListeners.splice(index, 1);
        }
      })
    };
  }),
  
  removeAllListeners: vi.fn(() => {
    listeners.clear();
  }),
  
  exitApp: vi.fn(),
  getInfo: vi.fn().mockResolvedValue({
    name: 'Zaparoo',
    id: 'com.zaparoo.app',
    build: '1',
    version: '1.0.0'
  }),
  
  // Test utilities
  __simulateBackButton: () => {
    const eventListeners = listeners.get('backButton') || [];
    eventListeners.forEach(callback => callback());
  },
  
  __simulateAppStateChange: (isActive: boolean) => {
    const eventListeners = listeners.get('appStateChange') || [];
    eventListeners.forEach(callback => callback({ isActive }));
  },
  
  __reset: () => {
    listeners.clear();
    vi.clearAllMocks();
  }
};
```

### MSW WebSocket/API Handlers

#### src/test-utils/msw-handlers.ts

```typescript
import { ws, http } from 'msw';

export const handlers = [
  // WebSocket handler for Zaparoo Core API (matches actual URL pattern)
  ws.link('ws://*/api/v0.1', {
    onConnection({ client }) {
      client.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        
        // Handle ping/pong for websocket-heartbeat-js
        if (event.data === 'ping') {
          client.send('pong');
          return;
        }
        
        // Mock JSON-RPC responses based on method
        const response = { jsonrpc: '2.0', id: data.id };
        
        switch (data.method) {
          case 'version':
            client.send(JSON.stringify({ ...response, result: { version: '1.0.0' } }));
            break;
          case 'media':
            client.send(JSON.stringify({ ...response, result: { 
              database: { exists: true, indexing: false, totalSteps: 0, currentStep: 0, currentStepDisplay: '', totalFiles: 0 },
              active: []
            }}));
            break;
          case 'tokens':
            client.send(JSON.stringify({ ...response, result: { last: null } }));
            break;
          default:
            client.send(JSON.stringify({ ...response, result: {} }));
        }
      });
    },
  }),
];
```

---

## 🛠️ Test Utilities (Minimal Setup)

### src/test-utils/index.tsx

```typescript
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    }),
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // Create minimal test router
  const rootRoute = createRootRoute({
    component: () => <Outlet />
  });
  
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui
  });
  
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    history: createMemoryHistory({ initialEntries: [route] }),
    defaultPendingMinMs: 0 // Critical for test performance
  });
  
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }
  
  return {
    ...rtlRender(ui, { wrapper: Wrapper, ...renderOptions }),
    router,
    queryClient
  };
}

// Re-export everything from RTL
export * from '@testing-library/react';
export { renderWithProviders as render };
```

### src/test-utils/factories.ts

```typescript
import { faker } from '@faker-js/faker';
import type { TokenResponse, MediaResponse } from '@/lib/models';

export const tokenResponseFactory = (overrides?: Partial<TokenResponse>): TokenResponse => ({
  type: faker.helpers.arrayElement(['media', 'launch', 'api']),
  label: faker.lorem.words(3),
  data: faker.string.uuid(),
  enabled: true,
  ...overrides
});

export const mediaResponseFactory = (overrides?: Partial<MediaResponse>): MediaResponse => ({
  system_id: faker.string.uuid(),
  system_name: faker.company.name(),
  media_name: faker.lorem.words(2),
  media_path: faker.system.filePath(),
  ...overrides
});

export const createMockApiResponses = () => ({
  version: { version: '1.0.0' },
  media: mediaResponseFactory(),
  tokens: [tokenResponseFactory()],
  launch: { success: true },
  stop: { success: true }
});
```

### src/test-utils/helpers.ts

```typescript
import { waitFor } from '@testing-library/react';
import { Nfc } from '@capawesome-team/capacitor-nfc';
import { faker } from '@faker-js/faker';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

export const simulateNfcScan = async (tagData: string) => {
  const mockTag = {
    id: faker.string.uuid(),
    message: {
      records: [{
        data: new TextEncoder().encode(tagData),
        recordType: 'TEXT'
      }]
    }
  };
  
  (Nfc as any).__simulateTagScanned(mockTag);
  
  await waitFor(() => {
    expect(Nfc.startScanSession).toHaveBeenCalled();
  });
};

export const waitForStoreUpdate = async (condition: () => boolean, timeout = 1000) => {
  await waitFor(() => {
    expect(condition()).toBe(true);
  }, { timeout });
};

// Reset all Capacitor mocks
export const resetAllMocks = () => {
  [Nfc, App, Preferences].forEach(mock => {
    if (mock.__reset) mock.__reset();
  });
};

// Test localStorage + Preferences together (matches real app usage)
export const setupMockStorage = () => {
  const storage = new Map<string, string>();
  
  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => storage.get(key) || null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    },
    writable: true,
  });
  
  return storage;
};
```

---

## 📁 Project Structure

```
src/
├── __tests__/
│   ├── fixtures/                          # Test data and scenarios
│   │   ├── nfc-tags.ts                    # Sample NFC tag data
│   │   ├── api-responses.ts               # Sample API responses
│   │   └── websocket-messages.ts          # Sample WebSocket messages
│   ├── unit/
│   │   ├── hooks/
│   │   │   ├── useAppSettings.test.ts
│   │   │   ├── useScanOperations.test.tsx
│   │   │   └── useWriteQueueProcessor.test.tsx
│   │   ├── lib/
│   │   │   ├── store.test.ts              # Test REAL Zustand logic
│   │   │   ├── coreApi.test.ts            # Test REAL API logic with MSW
│   │   │   ├── utils.test.ts              # Test utility functions
│   │   │   └── nfc.test.ts                # Test NFC logic with mocked plugin
│   │   └── components/
│   │       ├── home/
│   │       │   ├── ScanControls.test.tsx
│   │       │   └── ConnectionStatus.test.tsx
│   │       └── ui/
│   │           └── Button.test.tsx
│   ├── integration/
│   │   ├── nfc-scan-flow.test.tsx         # Full scan-to-launch flow
│   │   ├── websocket-connection.test.tsx   # Real API + MSW WebSocket
│   │   ├── queue-processing.test.tsx       # Multi-operation queues
│   │   └── settings-persistence.test.tsx   # Settings + Preferences
│   └── e2e/ (future)
├── __mocks__/
│   ├── @capacitor/
│   │   ├── preferences.ts
│   │   ├── app.ts
│   │   └── ...
│   └── @capawesome-team/
│       └── capacitor-nfc.ts
├── test-utils/
│   ├── index.tsx
│   ├── factories.ts
│   ├── helpers.ts
│   └── msw-handlers.ts
└── test-setup.ts
```

---

## 🧪 Test Examples and Patterns

### Unit Test: Real Zustand Store Logic

```typescript
// src/__tests__/unit/lib/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStatusStore } from '@/lib/store';

describe('useStatusStore', () => {
  beforeEach(() => {
    // Reset to initial state - NO MOCKING
    useStatusStore.setState(useStatusStore.getInitialState());
  });
  
  describe('connection state', () => {
    it('should initialize with disconnected state', () => {
      const { result } = renderHook(() => useStatusStore());
      
      expect(result.current.connected).toBe(false);
      expect(result.current.connectionError).toBe('');
    });
    
    it('should update connection status', () => {
      const { result } = renderHook(() => useStatusStore());
      
      act(() => {
        result.current.setConnected(true);
      });
      
      expect(result.current.connected).toBe(true);
    });
  });
  
  describe('device history', () => {
    it('should add unique device addresses', () => {
      const { result } = renderHook(() => useStatusStore());
      
      act(() => {
        result.current.addDeviceHistory('192.168.1.100');
        result.current.addDeviceHistory('192.168.1.100'); // Duplicate
        result.current.addDeviceHistory('192.168.1.101');
      });
      
      expect(result.current.deviceHistory).toHaveLength(2);
      expect(result.current.deviceHistory[0].address).toBe('192.168.1.100');
      expect(result.current.deviceHistory[1].address).toBe('192.168.1.101');
    });
    
    it('should clear device history', () => {
      const { result } = renderHook(() => useStatusStore());
      
      act(() => {
        result.current.addDeviceHistory('192.168.1.100');
        result.current.clearDeviceHistory();
      });
      
      expect(result.current.deviceHistory).toHaveLength(0);
    });
  });
});
```

### Unit Test: CoreAPI with MSW WebSocket

```typescript
// src/__tests__/unit/lib/coreApi.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CoreAPI } from '@/lib/coreApi';
import { server } from '@/test-setup';

describe('CoreAPI', () => {
  let api: CoreAPI;
  
  beforeEach(() => {
    api = CoreAPI.getInstance();
  });
  
  describe('version request', () => {
    it('should handle version response correctly', async () => {
      // MSW automatically handles WebSocket mocking
      const result = await api.version();
      expect(result.version).toBe('1.0.0');
    });
    
    it('should handle connection errors', async () => {
      // Override handler for error scenario
      server.use(
        ws.link('ws://*/api/v0.1', {
          onConnection({ client }) {
            client.close({ code: 1006, reason: 'Connection failed' });
          },
        })
      );
      
      await expect(api.version()).rejects.toThrow();
    });
    
    it('should handle request timeout', async () => {
      // Test the 30-second timeout from actual implementation
      vi.useFakeTimers();
      
      const versionPromise = api.version();
      vi.advanceTimersByTime(31000); // Past the 30s timeout
      
      await expect(versionPromise).rejects.toThrow('Request timeout');
      vi.useRealTimers();
    });
    
    it('should handle out-of-order responses', async () => {
      // Test JSON-RPC id correlation
      server.use(
        ws.link('ws://*/api/v0.1', {
          onConnection({ client }) {
            client.addEventListener('message', (event) => {
              const data = JSON.parse(event.data);
              // Send response with different id
              client.send(JSON.stringify({
                jsonrpc: '2.0',
                id: 'wrong-id',
                result: { version: '1.0.0' }
              }));
            });
          },
        })
      );
      
      // Should handle gracefully (logs but doesn't crash)
      await expect(api.version()).rejects.toThrow('Request timeout');
    });
  });
});
```

### Component Test: Real Component with Mocked Dependencies

```typescript
// src/__tests__/unit/components/home/ScanControls.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test-utils';
import { ScanControls } from '@/components/home/ScanControls';
import { useStatusStore } from '@/lib/store';
import { Nfc } from '@capawesome-team/capacitor-nfc';

describe('ScanControls', () => {
  beforeEach(() => {
    useStatusStore.setState(useStatusStore.getInitialState());
    Nfc.__reset();
  });
  
  it('should disable scan button when disconnected', () => {
    useStatusStore.setState({ connected: false });
    
    render(<ScanControls />);
    
    const scanButton = screen.getByRole('button', { name: /scan/i });
    expect(scanButton).toBeDisabled();
  });
  
  it('should enable scan button when connected', () => {
    useStatusStore.setState({ connected: true });
    
    render(<ScanControls />);
    
    const scanButton = screen.getByRole('button', { name: /scan/i });
    expect(scanButton).toBeEnabled();
  });
  
  it('should start NFC scan on button click', async () => {
    const user = userEvent.setup();
    useStatusStore.setState({ connected: true });
    
    render(<ScanControls />);
    
    const scanButton = screen.getByRole('button', { name: /scan/i });
    await user.click(scanButton);
    
    expect(Nfc.startScanSession).toHaveBeenCalled();
  });
  
  it('should show scanning state during scan', async () => {
    const user = userEvent.setup();
    useStatusStore.setState({ connected: true });
    
    render(<ScanControls />);
    
    const scanButton = screen.getByRole('button', { name: /scan/i });
    await user.click(scanButton);
    
    // Check that scanning state is shown
    expect(screen.getByText(/scanning/i)).toBeInTheDocument();
  });
});
```

### Integration Test: Full User Flow

```typescript
// src/__tests__/integration/nfc-scan-flow.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test-utils';
import { HomePage } from '@/routes/index';
import { simulateNfcScan } from '@/test-utils/helpers';
import { useStatusStore } from '@/lib/store';
import { Nfc } from '@capawesome-team/capacitor-nfc';

describe('NFC Scan Flow Integration', () => {
  beforeEach(() => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true
    });
    Nfc.__reset();
  });
  
  it('should complete full scan-to-launch flow', async () => {
    const user = userEvent.setup();
    
    render(<HomePage />);
    
    // Start scan
    const scanButton = screen.getByRole('button', { name: /scan/i });
    await user.click(scanButton);
    
    expect(Nfc.startScanSession).toHaveBeenCalled();
    expect(screen.getByText(/scanning/i)).toBeInTheDocument();
    
    // Simulate NFC tag scan
    await simulateNfcScan('ZAP:launch.system:snes');
    
    // Wait for processing
    await waitFor(() => {
      expect(screen.getByText(/launched/i)).toBeInTheDocument();
    });
    
    // Verify scan session stopped
    expect(Nfc.stopScanSession).toHaveBeenCalled();
  });
  
  it('should handle scan errors gracefully', async () => {
    const user = userEvent.setup();
    
    render(<HomePage />);
    
    // Start scan
    const scanButton = screen.getByRole('button', { name: /scan/i });
    await user.click(scanButton);
    
    // Simulate NFC error
    Nfc.__simulateError({ message: 'NFC not available' });
    
    await waitFor(() => {
      expect(screen.getByText(/nfc not available/i)).toBeInTheDocument();
    });
  });
});
```

### Hook Test: Real Hook Logic

```typescript
// src/__tests__/unit/hooks/useAppSettings.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Preferences } from '@capacitor/preferences';

describe('useAppSettings', () => {
  beforeEach(() => {
    Preferences.__reset();
  });
  
  it('should load settings from Preferences on mount', async () => {
    // Setup mock preferences
    vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
      const mockData: Record<string, string> = {
        'restartScan': 'true',
        'launchOnScan': 'false',
        'launcherAccess': 'true'
      };
      return { value: mockData[key] || null };
    });
    
    const { result } = renderHook(() => 
      useAppSettings({
        initData: {
          restartScan: false,
          launchOnScan: true
        }
      })
    );
    
    // Wait for async preferences to load
    await waitFor(() => {
      expect(result.current.restartScan).toBe(true);
      expect(result.current.launchOnScan).toBe(false);
      expect(result.current.launcherAccess).toBe(true);
    });
    
    // Verify Preferences was called
    expect(Preferences.get).toHaveBeenCalledWith({ key: 'restartScan' });
    expect(Preferences.get).toHaveBeenCalledWith({ key: 'launchOnScan' });
    expect(Preferences.get).toHaveBeenCalledWith({ key: 'launcherAccess' });
  });
  
  it('should save settings changes to Preferences', async () => {
    const { result } = renderHook(() => 
      useAppSettings({
        initData: {
          restartScan: false,
          launchOnScan: true
        }
      })
    );
    
    act(() => {
      result.current.setRestartScan(true);
    });
    
    await waitFor(() => {
      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'restartScan',
        value: 'true'
      });
    });
  });
});
```

---

## 🔄 TDD Workflow

### 1. New Feature Development Process

```bash
# Step 1: Create test file first
touch src/__tests__/unit/features/new-feature.test.tsx

# Step 2: Write failing test describing expected behavior
# Step 3: Run test to verify it fails correctly
npm run test:watch

# Step 4: Implement minimum code to make test pass
# Step 5: Refactor with confidence (tests protect against regression)
# Step 6: Add edge cases and error handling tests
```

### 2. Test-First Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test-utils';

describe('NewFeature', () => {
  beforeEach(() => {
    // Reset state, clear mocks
    vi.clearAllMocks();
  });
  
  describe('when user performs action', () => {
    it('should show expected result', async () => {
      // Arrange: Setup test data and state
      const user = userEvent.setup();
      
      // Act: User interaction
      render(<NewFeature />);
      await user.click(screen.getByRole('button'));
      
      // Assert: Verify expected behavior
      expect(screen.getByText('Expected Result')).toBeInTheDocument();
    });
    
    it('should handle error cases', async () => {
      // Test error scenarios
    });
  });
});
```

### 3. Pre-commit Hook Setup (Optional)

```bash
# Install husky and lint-staged
npm install --save-dev husky lint-staged

# Setup pre-commit hooks
npx husky add .husky/pre-commit "npx lint-staged"
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "npm run test -- --related --run"
    ]
  }
}
```

---

## 🚀 CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Type check
        run: pnpm typecheck
      
      - name: Lint
        run: pnpm lint
      
      - name: Run tests
        run: pnpm test:ci
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true
```

---

## 🎯 Best Practices and Guidelines

### 1. What to Mock vs What to Test

#### ✅ **MOCK (External Dependencies)**
- **Hardware APIs**: NFC, Barcode, KeepAwake (require physical hardware)
- **External Services**: RevenueCat, Firebase, etc. (network dependent)
- **WebSocket**: Use MSW for JSON-RPC communication

#### ⚖️ **SELECTIVE MOCKING (Use Wrapper Pattern)**
- **Preferences**: Test with real logic but mock I/O operations
- **App**: Test lifecycle logic but mock platform-specific behavior
- **Platform Detection**: Allow per-test override for iOS/Android paths

#### ❌ **DON'T MOCK (Business Logic)**
- **Zustand Stores**: Test real state management and persistence logic
- **React Components**: Test real rendering and interaction logic
- **CoreAPI Class**: Test real JSON-RPC logic with mocked WebSocket
- **Storage Mix**: Test real localStorage + Preferences coordination
- **Queue Processing**: Test real queue logic with mocked operations

### 2. Test Writing Guidelines

```typescript
// ❌ DON'T: Test implementation details
expect(mockFunction).toHaveBeenCalledWith(specificArgs);

// ✅ DO: Test user-visible behavior
expect(screen.getByText('Success message')).toBeInTheDocument();

// ❌ DON'T: Use arbitrary timeouts
setTimeout(() => expect(something).toBe(true), 1000);

// ✅ DO: Use waitFor with specific conditions
await waitFor(() => {
  expect(screen.getByText('Loading complete')).toBeInTheDocument();
});
```

### 3. Performance Optimizations

- **Use happy-dom**: 2x faster than jsdom
- **Default thread pool**: Avoid 'forks' pool for better performance
- **Set defaultPendingMinMs: 0**: Critical for TanStack Router tests
- **Use vi.useFakeTimers()**: For timeout/reconnection tests
- **Batch API calls**: Test multiple operations together

### 4. React 19 + WebSocket-Heartbeat Considerations

- **Test Async Transitions**: Use `useTransition` for async operations
- **Suspense Boundaries**: Test loading states properly
- **WebSocket Library**: Account for `websocket-heartbeat-js` ping/pong in MSW handlers
- **Mixed Storage**: Test both localStorage and Preferences coordination
- **Platform Detection**: Test web/iOS/Android code paths with platform helper

### 5. Common Pitfalls to Avoid

- **Broken Mock Factories**: Use explicit `vi.mock('module', factory)` for __mocks__ files
- **Missing MSW Handlers**: Wire handlers to setupServer in test-setup.ts
- **Wrong WebSocket URL**: Use `ws://*/api/v0.1` to match actual implementation
- **Testing Implementation**: Focus on user behavior, not mock calls
- **Mixed Storage Issues**: Test localStorage + Preferences coordination together
- **Platform Lock-in**: Test iOS/Android paths, not just web

### 6. Debugging Test Issues

```bash
# Run single test file
npm run test -- src/__tests__/unit/lib/store.test.ts

# Run with UI for visual debugging
npm run test:ui

# Run specific test by name
npm run test -- --grep "should handle connection"

# Debug in VS Code - add to .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "${relativeFile}"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

---

## ⚠️ Critical Implementation Fixes

**These issues MUST be fixed or the testing setup will fail completely:**

### 1. **MSW Handler Wiring**
- **Issue**: `setupServer()` created without handlers, handlers exported separately
- **Fix**: Import handlers in test-setup.ts: `setupServer(...handlers)`
- **Impact**: WebSocket mocking won't work without this

### 2. **Manual Mock Resolution** 
- **Issue**: `vi.mock('module')` without factory - Vitest doesn't auto-resolve `__mocks__`
- **Fix**: Use explicit factories: `vi.mock('module', () => import('../__mocks__/module'))`
- **Impact**: Capacitor plugin mocks won't load without this

### 3. **WebSocket URL Pattern**
- **Issue**: Plan uses `ws://localhost:7497/websocket`, actual app uses `ws://host:7497/api/v0.1`
- **Fix**: Update MSW pattern to `ws://*/api/v0.1`
- **Impact**: WebSocket mocking won't intercept real connections

### 4. **Missing WebSocket Heartbeat**
- **Issue**: App uses `websocket-heartbeat-js` with ping/pong, plan doesn't handle this
- **Fix**: Add ping/pong handling in MSW WebSocket handler
- **Impact**: Connection tests will fail without heartbeat support

---

## 📈 Migration and Adoption Strategy

### Phase 1: Foundation (Week 1)
- [ ] Install dependencies and configure Vitest
- [ ] Create test-setup.ts with proper MSW wiring
- [ ] Create explicit mock factories for Capacitor plugins
- [ ] Setup test-utils with minimal providers
- [ ] Add storage test helpers
- [ ] Write first example tests with platform switching

### Phase 2: Core Logic (Week 2)
- [ ] Test Zustand store operations (real logic + real Preferences)
- [ ] Test CoreAPI class (JSON-RPC with MSW WebSocket + timeout/reconnection)
- [ ] Test mixed localStorage + Preferences coordination
- [ ] Test critical hooks (useAppSettings, useScanOperations)

### Phase 3: Components (Week 3-4)
- [ ] Test main UI components (ScanControls, ConnectionStatus)
- [ ] Test navigation flows
- [ ] Test modals and forms
- [ ] Test error boundaries

### Phase 4: Integration (Month 2)
- [ ] Full user flow tests (scan-to-launch)
- [ ] Error scenario testing
- [ ] Queue processing tests
- [ ] Settings persistence tests

### Phase 5: Enforcement and CI
- [ ] Add pre-commit hooks
- [ ] Setup GitHub Actions
- [ ] Enable coverage reporting
- [ ] Establish coverage goals (gradually increase)

### Gradual Coverage Strategy

1. **Start**: No coverage requirements
2. **Month 1**: Focus on critical paths
3. **Month 2**: Add component testing
4. **Month 3**: Integration test coverage
5. **Month 4+**: Aim for 80% coverage on new code

---

## 📚 Resources and References

- **[Vitest Documentation](https://vitest.dev/)** - Official Vitest guide
- **[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)** - User-focused testing
- **[TanStack Router Testing](https://github.com/TanStack/router/discussions)** - Community discussions
- **[Capacitor Plugin Mocking](https://capacitorjs.com/docs/guides/mocking-plugins)** - Official mocking guide
- **[vitest-websocket-mock](https://github.com/akiomik/vitest-websocket-mock)** - WebSocket testing
- **[MSW Documentation](https://mswjs.io/)** - Advanced API mocking
- **[React 19 Features](https://react.dev/blog/2024/12/05/react-v19)** - Latest React features

---

## 🎯 Summary

This testing infrastructure provides a solid foundation for TDD in the Zaparoo app while maintaining pragmatic principles:

### Key Benefits
1. **Realistic Testing**: Test actual business logic, not mocks
2. **Fast Feedback**: Optimized for quick test runs
3. **User-Focused**: Tests match user interactions
4. **Maintainable**: Minimal mocking means less maintenance
5. **Gradual Adoption**: Start small, grow coverage over time

### Success Metrics
- Tests run in <2 seconds for watch mode
- New features always have tests written first
- Integration tests catch real bugs
- CI/CD pipeline prevents regressions
- Team confidence in refactoring increases

Start with unit tests for critical business logic, add integration tests for key user flows, and gradually build toward comprehensive coverage. The infrastructure will scale with your testing needs.