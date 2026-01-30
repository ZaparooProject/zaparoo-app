# AGENTS.md

This file provides guidance to AI agents when working with the Zaparoo App codebase.

## Commands

### Development

- `pnpm dev` - Start development server with Vite
- `pnpm dev:server` - Start with dev server mode (requires `DEV_SERVER_IP` in `.env`)
- `pnpm build` - TypeScript compile + Vite build + Capacitor sync (production)
- `pnpm build:web` - Build web version only (no Capacitor sync)
- `pnpm build:core` - Build for embedded Core mode
- `pnpm build:server` - Build with dev server URL enabled
- `pnpm sync` - Sync web app with mobile platforms
- `pnpm typecheck` - TypeScript type checking without emitting files
- `pnpm lint` - ESLint checking
- `pnpm lint:fix` - ESLint with auto-fix
- `pnpm format` - Prettier formatting
- `pnpm format:check` - Check Prettier formatting
- `pnpm build:analyze` - Build with bundle size analyzer
- `npx cap open ios` - Open iOS project in Xcode
- `npx cap open android` - Open Android project in Android Studio

### Live Updates

- `pnpm live-update` - Build and push a signed live update to users (requires `live-update-private.pem`)
- `pnpm live-update:list` - List deployed live update bundles

### Testing

- `pnpm test` - Run Vitest tests
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:ui` - Run tests with Vitest UI

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Mobile**: Capacitor 7 (cross-platform iOS/Android)
- **Routing**: TanStack Router with file-based routing
- **State**: Zustand stores (`src/lib/store.ts`, `src/lib/preferencesStore.ts`)
- **Styling**: TailwindCSS 4 with custom CSS variables
- **Networking**: WebSocket + HTTP JSON-RPC with Zaparoo Core service
- **Testing**: Vitest + React Testing Library + MSW
- **i18n**: i18next with 7 supported languages
- **CI/CD**: Capawesome Cloud (builds + live updates)

### Directory Structure

```
src/
  components/        # React components
    ui/              # shadcn/ui-based components (accordion, button, dialog, etc.)
    wui/             # Custom Zaparoo UI components (Button, Card, TextInput, etc.)
    home/            # Home page components
    nfc/             # NFC-related components
  hooks/             # Custom React hooks
  lib/               # Core utilities, API clients, store, models
    transport/       # WebSocket transport layer
  routes/            # TanStack Router file-based routes
  translations/      # i18n JSON files (en-US, zh-CN, ko-KR, fr-FR, nl-NL, ja-JP, de-DE)
  __tests__/         # Test suites
    unit/            # Unit tests
    integration/     # Integration tests
    smoke/           # Smoke tests
  test-utils/        # Test helpers, factories, MSW handlers
  __mocks__/         # Capacitor plugin mocks
```

### Key Files

- `src/lib/store.ts` - Main Zustand store for connection/app state
- `src/lib/preferencesStore.ts` - Persisted preferences with Capacitor storage
- `src/lib/coreApi.ts` - JSON-RPC API client for Zaparoo Core
- `src/lib/logger.ts` - Logging utility with Rollbar integration
- `src/lib/nfc.ts` - NFC operations with session management
- `src/lib/models.ts` - TypeScript interfaces and API method enums
- `src/i18n.ts` - i18next configuration

## Testing Requirements

### Testing Philosophy

#### The Testing Trophy Model

Tests in this codebase follow the "Testing Trophy" model, which prioritizes integration tests for maximum return on investment:

```
        ╱╲
       ╱  ╲        E2E / Smoke (few)
      ╱────╲       Critical user journeys only
     ╱      ╲
    ╱ INTEG- ╲     Integration (most)
   ╱  RATION  ╲    Highest confidence, test features as users experience them
  ╱────────────╲
 ╱    UNIT      ╲  Unit (some)
╱________________╲ Pure logic, utilities, edge cases
     STATIC        TypeScript + ESLint (foundation)
```

**Key Principle:** "The more your tests resemble the way your software is used, the more confidence they can give you." — Kent C. Dodds

#### What Each Level Owns

| Level       | Owns                                              | Examples                                              |
| ----------- | ------------------------------------------------- | ----------------------------------------------------- |
| Static      | Type errors, syntax, code style                   | TypeScript errors, ESLint violations                  |
| Unit        | Pure functions, utilities, validators, edge cases | `formatDate()`, `validateEmail()`, store selectors    |
| Integration | Component + state + API behavior                  | Form submission, modal interactions, search flows     |
| Smoke       | Critical user journeys work                       | App loads, navigation works, core features accessible |

#### Why Integration Tests Have Highest ROI

1. **User-centric**: Tests the actual user experience, not internal implementation
2. **Refactor-friendly**: Less brittle when implementation changes
3. **Bug detection**: Catches integration bugs that unit tests miss
4. **Confidence**: Proves multiple parts work together correctly
5. **Maintenance**: Fewer tests needed to achieve same confidence

### Test Organization

#### Directory Structure

Tests are organized by type with specific patterns:

- **Unit tests**: `src/__tests__/unit/**/*.test.{ts,tsx}` - Individual components, hooks, utilities
- **Integration tests**: `src/__tests__/integration/**/*.test.tsx` - Feature flows and interactions
- **Smoke tests**: `src/__tests__/smoke/**/*.test.ts` - Basic sanity checks

#### File Naming

- `ComponentName.test.tsx` - General tests for a component
- `ComponentName.ios.test.tsx` - iOS-specific tests
- `hookName.test.ts` - Hook tests (non-JSX)
- `utility.test.ts` - Utility function tests

### Test Structure & Naming

#### AAA Pattern (Arrange-Act-Assert)

Every test should follow this structure for clarity:

```typescript
it("should show error when form is submitted empty", async () => {
  // Arrange - Set up the test scenario
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  // Act - Perform the action being tested
  await user.click(screen.getByRole("button", { name: /submit/i }));

  // Assert - Verify the expected outcome
  expect(screen.getByRole("alert")).toHaveTextContent(/email is required/i);
  expect(onSubmit).not.toHaveBeenCalled();
});
```

#### Test Naming Conventions

Use `should + verb` format that describes behavior from the user's perspective:

```typescript
// ✅ GOOD - Describes observable behavior
it("should show error when email is invalid", () => {});
it("should disable submit button while loading", () => {});
it("should navigate to home after successful login", () => {});

// ❌ BAD - Describes implementation details
it("should set error state to true", () => {});
it("should call validateEmail function", () => {});
it("should update the DOM", () => {});
```

#### Describe Block Organization

```typescript
describe("LoginForm", () => {
  // Group by feature or behavior
  describe("validation", () => {
    it("should show error when email is empty", () => {});
    it("should show error when email format is invalid", () => {});
  });

  describe("submission", () => {
    it("should call onSubmit with form data", () => {});
    it("should show loading state while submitting", () => {});
  });
});
```

### Test Setup

The test environment is configured in `vitest.config.ts` and `src/test-setup.ts`:

- **Environment**: happy-dom
- **Global mocks**: i18n (returns keys as-is), WebSocket, matchMedia, IntersectionObserver
- **MSW handlers**: `src/test-utils/msw-handlers.ts` for API mocking
- **Custom render**: `src/test-utils/index.tsx` wraps with providers (QueryClient, A11yAnnouncer, SlideModal)

#### Import from test-utils

```typescript
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

#### Automatic Cleanup

The setup automatically handles after each test:

- `CoreAPI.reset()` - Reset API client state
- `vi.clearAllTimers()` and `vi.useRealTimers()` - Timer cleanup
- `server.resetHandlers()` - MSW handler reset
- React Testing Library cleanup

### Query Priority (React Testing Library)

Use accessible queries in this priority order:

| Priority | Query                  | Use Case                                                |
| -------- | ---------------------- | ------------------------------------------------------- |
| 1        | `getByRole`            | Best for accessibility - buttons, links, headings, etc. |
| 2        | `getByLabelText`       | Form inputs with labels                                 |
| 3        | `getByPlaceholderText` | Inputs without visible labels (less preferred)          |
| 4        | `getByText`            | Non-interactive content, messages                       |
| 5        | `getByDisplayValue`    | Current value of form elements                          |
| 6        | `getByAltText`         | Images                                                  |
| 7        | `getByTitle`           | Elements with title attribute (rarely needed)           |
| 8        | `getByTestId`          | **Last resort only** - when no semantic query works     |

#### Query Variants

| Variant    | Returns           | Throws                          | Use Case                              |
| ---------- | ----------------- | ------------------------------- | ------------------------------------- |
| `getBy*`   | Element           | Yes, if not found               | Element should exist immediately      |
| `queryBy*` | Element or `null` | No                              | Assert element does NOT exist         |
| `findBy*`  | Promise<Element>  | Yes, if not found after timeout | Element appears after async operation |

```typescript
// ✅ Element should exist immediately
const button = screen.getByRole("button", { name: /submit/i });

// ✅ Assert element does NOT exist
expect(screen.queryByRole("alert")).not.toBeInTheDocument();

// ✅ Wait for async content to appear
const successMessage = await screen.findByText(/success/i);

// ❌ BAD - getBy for async content (throws immediately if not found)
const message = screen.getByText(/success/i); // Will fail before async completes
```

### User Interactions

#### Always Use userEvent.setup()

`userEvent` simulates real user behavior more accurately than `fireEvent`:

```typescript
it("should submit form on button click", async () => {
  const user = userEvent.setup();
  const handleSubmit = vi.fn();
  render(<Form onSubmit={handleSubmit} />);

  // Type in input (includes focus, keydown, keyup events)
  await user.type(screen.getByLabelText(/email/i), "test@example.com");

  // Click button (includes mousedown, mouseup, click events)
  await user.click(screen.getByRole("button", { name: /submit/i }));

  expect(handleSubmit).toHaveBeenCalledWith({ email: "test@example.com" });
});
```

#### userEvent vs fireEvent

| Aspect          | userEvent                           | fireEvent                                 |
| --------------- | ----------------------------------- | ----------------------------------------- |
| Realism         | Simulates full user interaction     | Directly triggers single DOM event        |
| Focus handling  | Automatically manages focus         | Manual focus management needed            |
| Keyboard events | Types character by character        | Single event                              |
| Async           | Always async (requires await)       | Synchronous                               |
| Use when        | Default choice for all interactions | userEvent doesn't support the interaction |

```typescript
// ✅ GOOD - userEvent for realistic interactions
const user = userEvent.setup();
await user.click(button);
await user.type(input, "hello");
await user.keyboard("{Enter}");

// Use fireEvent only when necessary
import { fireEvent } from "@testing-library/react";
fireEvent.scroll(container, { target: { scrollY: 100 } }); // scroll not in userEvent
```

### Async Testing Patterns

#### Proper waitFor Usage

```typescript
// ✅ GOOD - Wait for specific condition
await waitFor(() => {
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});

// ✅ GOOD - Use findBy for appearing elements (simpler)
const element = await screen.findByText("Loaded");

// ✅ GOOD - waitFor with custom timeout
await waitFor(
  () => {
    expect(mockFn).toHaveBeenCalled();
  },
  { timeout: 3000 },
);

// ❌ BAD - Empty waitFor (does nothing)
await waitFor(() => {});

// ❌ BAD - Side effects inside waitFor (runs multiple times!)
await waitFor(() => {
  fireEvent.click(button); // This will click multiple times
  expect(result).toBe(true);
});

// ❌ BAD - Multiple assertions in waitFor (only first failure reported)
await waitFor(() => {
  expect(a).toBe(1);
  expect(b).toBe(2); // Won't run if first fails
});
```

#### Testing Loading States

```typescript
it("should show loading then content", async () => {
  render(<AsyncComponent />);

  // Loading state appears immediately
  expect(screen.getByRole("progressbar")).toBeInTheDocument();

  // Content appears after loading (findBy auto-waits up to 1000ms)
  expect(await screen.findByText("Content loaded")).toBeInTheDocument();

  // Loading indicator should be gone
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
```

#### Testing Error States

```typescript
it("should show error when API fails", async () => {
  // Override MSW handler for this test
  server.use(
    http.post("*/api", () => {
      return HttpResponse.json(
        { jsonrpc: "2.0", id: 1, error: { message: "Server error" } },
        { status: 500 }
      );
    })
  );

  render(<DataComponent />);

  // Wait for error to appear
  expect(await screen.findByRole("alert")).toHaveTextContent(/error/i);
});
```

### Zustand Store Testing

#### Testing Components That Use Stores

```typescript
import { useStatusStore } from "@/lib/store";
import { act } from "@testing-library/react";

beforeEach(() => {
  // Reset store to initial state before each test
  useStatusStore.setState(useStatusStore.getInitialState());
});

it("should update UI when connection state changes", async () => {
  render(<ConnectionStatus />);

  // Initial disconnected state
  expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

  // Update store state
  act(() => {
    useStatusStore.getState().setConnected(true);
  });

  // UI reflects the change
  expect(screen.getByText(/connected/i)).toBeInTheDocument();
});
```

#### Testing Store Selectors and Actions

When testing store logic directly (rare - prefer testing through components):

```typescript
import { useStatusStore } from "@/lib/store";
import { act } from "@testing-library/react";

describe("useStatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState(useStatusStore.getInitialState());
  });

  it("should add item to run queue", () => {
    act(() => {
      useStatusStore.getState().addToRunQueue({ text: "game.launch" });
    });

    expect(useStatusStore.getState().runQueue).toHaveLength(1);
    expect(useStatusStore.getState().runQueue[0].text).toBe("game.launch");
  });

  it("should clear queue after processing", () => {
    // Setup: add items to queue
    act(() => {
      useStatusStore.getState().addToRunQueue({ text: "item1" });
      useStatusStore.getState().addToRunQueue({ text: "item2" });
    });

    // Action: clear queue
    act(() => {
      useStatusStore.getState().clearRunQueue();
    });

    // Assert: queue is empty
    expect(useStatusStore.getState().runQueue).toHaveLength(0);
  });
});
```

#### Testing Preferences Store with Persistence

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

beforeEach(() => {
  // Reset preferences to defaults
  usePreferencesStore.setState({
    ...usePreferencesStore.getInitialState(),
    _hasHydrated: true, // Mark as hydrated for tests
  });
});

it("should update preference and reflect in component", async () => {
  render(<SettingsPanel />);

  // Toggle a setting
  const user = userEvent.setup();
  await user.click(screen.getByRole("switch", { name: /haptics/i }));

  // Verify store was updated
  expect(usePreferencesStore.getState().hapticsEnabled).toBe(false);
});
```

### MSW Best Practices

#### Use Factory Functions for Mock Data

```typescript
import {
  mockTokenResponse,
  mockVersionResponse,
  mockMediaResponse,
} from "../../../test-utils/factories";

const token = mockTokenResponse({ uid: "specific-uid" }); // Override specific fields
const version = mockVersionResponse();
const media = mockMediaResponse({ name: "Super Mario Bros" });
```

Available factories: `mockSystem`, `mockVersionResponse`, `mockLaunchRequest`, `mockWriteRequest`, `mockTokenResponse`, `mockPlayingResponse`, `mockIndexResponse`, `mockMediaResponse`, `mockMappingResponse`

#### Default vs Per-Test Handlers

Default handlers in `src/test-utils/msw-handlers.ts` provide happy-path responses. Override for specific test scenarios:

```typescript
import { server } from "../../test-setup";
import { http, HttpResponse, delay } from "msw";

it("should show error on API failure", async () => {
  // Override for this test only
  server.use(
    http.post("*/api", () => {
      return HttpResponse.json(
        { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Not found" } },
        { status: 404 }
      );
    })
  );

  render(<DataComponent />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
});
```

#### Testing Network States

```typescript
// Test loading state with delayed response
it("should show loading indicator", async () => {
  server.use(
    http.post("*/api", async () => {
      await delay(100); // Small delay to observe loading state
      return HttpResponse.json({ jsonrpc: "2.0", id: 1, result: data });
    })
  );

  render(<DataComponent />);
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(await screen.findByText("Data loaded")).toBeInTheDocument();
});

// Test network error / offline state
it("should handle network failure", async () => {
  server.use(
    http.post("*/api", () => {
      return HttpResponse.error(); // Simulates network failure
    })
  );

  render(<DataComponent />);
  expect(await screen.findByText(/connection failed/i)).toBeInTheDocument();
});
```

### Flaky Test Prevention

#### Common Causes and Solutions

| Cause                         | Solution                                                |
| ----------------------------- | ------------------------------------------------------- |
| Race conditions               | Use `findBy*` queries, `waitFor`, proper async/await    |
| Shared state between tests    | Reset stores and mocks in `beforeEach`                  |
| Timer-dependent code          | Use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` |
| Random/non-deterministic data | Use factory functions with fixed values                 |
| Animation timing              | Mock or disable animations; use `waitFor`               |
| External dependencies         | Mock at module level, not inside tests                  |

#### Timer Testing

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("should auto-hide toast after 3 seconds", async () => {
  render(<Toast message="Hello" />);

  // Toast is visible
  expect(screen.getByText("Hello")).toBeInTheDocument();

  // Advance time
  act(() => {
    vi.advanceTimersByTime(3000);
  });

  // Toast is gone
  expect(screen.queryByText("Hello")).not.toBeInTheDocument();
});

it("should debounce search input", async () => {
  const onSearch = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  render(<SearchInput onSearch={onSearch} debounceMs={300} />);

  await user.type(screen.getByRole("searchbox"), "test");

  // Not called yet (debounced)
  expect(onSearch).not.toHaveBeenCalled();

  // Advance past debounce time
  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onSearch).toHaveBeenCalledWith("test");
});
```

#### Avoiding Test Pollution

```typescript
describe("FeatureComponent", () => {
  // Reset ALL shared state before each test
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState(useStatusStore.getInitialState());
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Tests are now isolated...
});
```

### Accessibility Testing

#### Use Accessible Queries

Accessible queries both test your UI and verify it's accessible:

```typescript
// ✅ Tests accessibility AND functionality
const submitButton = screen.getByRole("button", { name: /submit/i });
const emailInput = screen.getByLabelText(/email address/i);
const errorMessage = screen.getByRole("alert");
const navigation = screen.getByRole("navigation");
const heading = screen.getByRole("heading", { level: 1 });

// Common roles: button, link, textbox, checkbox, radio, combobox,
//               listbox, option, dialog, alert, progressbar, tab, tabpanel
```

#### Testing ARIA States

```typescript
it("should have correct ARIA states", async () => {
  render(<ExpandableSection title="Details" />);

  const button = screen.getByRole("button", { name: /details/i });
  const content = screen.getByRole("region");

  // Initial collapsed state
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(content).not.toBeVisible();

  // Expand
  await userEvent.click(button);

  // Expanded state
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(content).toBeVisible();
});

it("should indicate loading state accessibly", async () => {
  render(<SubmitButton loading />);

  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toBeDisabled();
});
```

#### Testing Focus Management

```typescript
it("should focus first element when modal opens", async () => {
  const user = userEvent.setup();
  render(<ModalTrigger />);

  await user.click(screen.getByRole("button", { name: /open modal/i }));

  // Dialog should be present and focused (or first focusable element)
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeInTheDocument();

  const closeButton = screen.getByRole("button", { name: /close/i });
  expect(closeButton).toHaveFocus();
});

it("should return focus to trigger when modal closes", async () => {
  const user = userEvent.setup();
  render(<ModalTrigger />);

  const openButton = screen.getByRole("button", { name: /open modal/i });
  await user.click(openButton);

  await user.click(screen.getByRole("button", { name: /close/i }));

  expect(openButton).toHaveFocus();
});
```

#### Testing Keyboard Navigation

```typescript
it("should support keyboard navigation", async () => {
  const user = userEvent.setup();
  render(<TabList tabs={["Tab 1", "Tab 2", "Tab 3"]} />);

  const tab1 = screen.getByRole("tab", { name: "Tab 1" });
  tab1.focus();

  // Arrow right moves to next tab
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveFocus();

  // Arrow left moves back
  await user.keyboard("{ArrowLeft}");
  expect(tab1).toHaveFocus();
});
```

### Component Testing Patterns

#### Testing Forms

```typescript
it("should validate and submit form", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<ContactForm onSubmit={onSubmit} />);

  // Submit empty form - should show validation errors
  await user.click(screen.getByRole("button", { name: /send/i }));

  expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();

  // Fill in valid data
  await user.type(screen.getByLabelText(/name/i), "John Doe");
  await user.type(screen.getByLabelText(/email/i), "john@example.com");
  await user.type(screen.getByLabelText(/message/i), "Hello!");

  // Submit - should succeed
  await user.click(screen.getByRole("button", { name: /send/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    name: "John Doe",
    email: "john@example.com",
    message: "Hello!",
  });
});
```

#### Testing Conditional Rendering

```typescript
it("should show pro features only when user has access", () => {
  const { rerender } = render(<FeaturePanel hasProAccess={false} />);

  // Pro feature hidden
  expect(screen.queryByText(/launch on scan/i)).not.toBeInTheDocument();
  expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();

  // Rerender with pro access
  rerender(<FeaturePanel hasProAccess={true} />);

  // Pro feature visible
  expect(screen.getByText(/launch on scan/i)).toBeInTheDocument();
  expect(screen.queryByText(/upgrade to pro/i)).not.toBeInTheDocument();
});
```

#### Testing Lists and Dynamic Content

```typescript
it("should render list items and handle removal", async () => {
  const user = userEvent.setup();
  const items = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
  ];

  render(<ItemList items={items} onRemove={vi.fn()} />);

  // Verify all items rendered
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Item 1")).toBeInTheDocument();
  expect(screen.getByText("Item 2")).toBeInTheDocument();

  // Remove first item
  const removeButtons = screen.getAllByRole("button", { name: /remove/i });
  await user.click(removeButtons[0]);

  // Verify callback called with correct id
  expect(vi.fn()).toHaveBeenCalledWith("1");
});
```

#### Testing Hooks

```typescript
import { renderHook, act } from "@testing-library/react";
import { useCounter } from "@/hooks/useCounter";

describe("useCounter", () => {
  it("should increment counter", () => {
    const { result } = renderHook(() => useCounter(0));

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it("should respect max value", () => {
    const { result } = renderHook(() => useCounter(0, { max: 5 }));

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.increment();
      }
    });

    expect(result.current.count).toBe(5);
  });
});
```

### Critical Anti-Patterns to Avoid

The following patterns have caused significant test quality issues. **Do not use them.**

**1. NEVER create fake components inside test files:**

```typescript
// ❌ BAD - Tests a fake component, provides zero coverage
it("should render", () => {
  const FakeComponent = () => <div>Fake</div>; // NEVER DO THIS
  render(<FakeComponent />);
});

// ✅ GOOD - Tests the actual component
import { RealComponent } from "@/components/RealComponent";
it("should render", () => {
  render(<RealComponent />);
});
```

**2. Don't over-mock - if you mock everything, you're testing mocks:**

```typescript
// ❌ BAD - Mocks the component being tested
vi.mock("@/components/Button", () => ({ Button: () => <button>Mock</button> }));

// ✅ GOOD - Mock only external dependencies (APIs, native plugins)
vi.mock("@capacitor/preferences", () => ({ Preferences: { get: vi.fn() } }));
```

**3. Use parameterized tests for repetitive patterns:**

```typescript
// ❌ BAD - Copy-paste tests (we had 21 identical tests!)
it("handles error A", () => {
  /* same pattern */
});
it("handles error B", () => {
  /* same pattern */
});

// ✅ GOOD - Parameterized test
const errorCases = [
  ["invalid email", "bad@", /invalid email/i],
  ["missing @", "test.com", /invalid email/i],
  ["empty", "", /required/i],
] as const;

it.each(errorCases)("shows error for %s", async (_, input, expectedError) => {
  const user = userEvent.setup();
  render(<EmailInput />);

  await user.type(screen.getByLabelText(/email/i), input);
  await user.tab(); // Trigger validation

  expect(screen.getByRole("alert")).toHaveTextContent(expectedError);
});
```

**4. Don't test TypeScript or library behavior:**

```typescript
// ❌ BAD - Tests TypeScript enums exist
expect(ApiMethod.Run).toBe("run");

// ❌ BAD - Tests Zustand library behavior
const store = create(() => ({ count: 0 }));
expect(store.getState().count).toBe(0);

// ✅ GOOD - Test YOUR code's behavior using the library
```

**5. Don't test CSS classes or DOM structure:**

```typescript
// ❌ BAD - Implementation detail
expect(document.querySelector(".lucide-icon")).toBeInTheDocument();

// ✅ GOOD - Test accessible behavior
expect(screen.getByRole("img", { name: "Warning" })).toBeInTheDocument();
```

**6. Never use hardcoded delays:**

```typescript
// ❌ BAD - Flaky, slow
await new Promise((resolve) => setTimeout(resolve, 1000));

// ✅ GOOD - Wait for actual condition
await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
```

**7. Don't write placeholder tests:**

```typescript
// ❌ BAD - Provides no value
it("should work", () => {
  expect(true).toBe(true);
});
```

**8. Don't test that imports exist:**

```typescript
// ❌ BAD - Tests nothing useful
it("should export hook", () => {
  expect(typeof useScanOperations).toBe("function");
});
```

**9. Don't read and regex source files:**

```typescript
// ❌ BAD - Fragile, tests source text not behavior
const source = fs.readFileSync("src/component.tsx", "utf8");
expect(source).toMatch(/aria-label/);
```

**10. Don't duplicate test logic from source:**

```typescript
// ❌ BAD - Duplicates implementation, doesn't test it
const calculateExpected = (a, b) => a + b; // Same as source
expect(add(1, 2)).toBe(calculateExpected(1, 2));

// ✅ GOOD - Test with known expected values
expect(add(1, 2)).toBe(3);
```

**11. Avoid duplicate test suites** - if two describe blocks assert the same things, consolidate them.

**12. Don't use `vi.doMock` after imports** - it won't work. Use `vi.mock` at top of file.

**13. Never use `@ts-expect-error` to test invalid props** - TypeScript already prevents this at compile time.

### What Makes a Valid Test

A test is valid if it:

1. **Imports and renders REAL components** from `src/`
2. **Tests observable behavior** (what users see/interact with)
3. **Would fail if the feature broke** in production
4. **Doesn't duplicate** another test's assertions

A test is INVALID if it:

1. Creates fake components inside the test file
2. Mocks the component being tested
3. Only tests mock implementations
4. Tests CSS classes or internal DOM structure
5. Duplicates another test with different wording

### Test Checklist

Before submitting tests, verify:

- [ ] Imports real component/hook from `src/`
- [ ] Only mocks external dependencies (APIs, native plugins, Capacitor)
- [ ] Uses accessible queries (`getByRole`, `getByLabelText`, etc.)
- [ ] Tests observable behavior, not implementation details
- [ ] Would fail if the feature actually broke
- [ ] Has both positive and negative assertions where applicable
- [ ] Uses factories from `test-utils/factories.ts` for mock data
- [ ] Properly cleans up with `beforeEach`/`afterEach`
- [ ] Uses `userEvent.setup()` for user interactions
- [ ] Uses `findBy*` or `waitFor` for async content
- [ ] No hardcoded delays or sleeps

## Logging Requirements

### Logger Usage

Use `src/lib/logger.ts` for all logging:

```typescript
import { logger } from "@/lib/logger";

// Development only (stripped in production)
logger.log("General info");
logger.debug("Debug details");
logger.warn("Warning message");

// Always logged + reports to Rollbar in production
logger.error("Error message", error);

// With metadata for better error tracking
logger.error("NFC write failed", error, {
  category: "nfc",
  action: "write",
  severity: "warning",
});
```

### Error Categories

Use appropriate categories for error classification:

- `nfc` - NFC operations
- `storage` - Preferences/storage operations
- `purchase` - RevenueCat/Pro purchases
- `api` - Core API calls
- `camera` - Barcode scanning
- `accelerometer` - Shake detection
- `queue` - Run/write queue processing
- `connection` - WebSocket connection
- `share` - Share functionality
- `lifecycle` - App lifecycle events
- `websocket` - WebSocket transport
- `general` - Default category

### Severity Levels

- `critical` - App-breaking errors
- `error` - Recoverable errors (default)
- `warning` - Unexpected but handled
- `info` - Informational
- `debug` - Debug-level details

## Capacitor & Platform Patterns

### Platform Detection

```typescript
import { Capacitor } from "@capacitor/core";

// Check if running on native platform (iOS/Android)
if (Capacitor.isNativePlatform()) {
  // Native-only code
}

// Get specific platform
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

### Capacitor Plugins Used

- `@capacitor/core` - Core platform API
- `@capacitor/app` - App lifecycle, deep linking
- `@capacitor/browser` - In-app browser
- `@capacitor/clipboard` - Clipboard access
- `@capacitor/device` - Device info
- `@capacitor/filesystem` - File system access
- `@capacitor/haptics` - Vibration/haptic feedback
- `@capacitor/network` - Network status detection
- `@capacitor/preferences` - Local storage (use instead of localStorage on native)
- `@capacitor/screen-reader` - Screen reader detection
- `@capacitor/share` - Native share sheet
- `@capacitor/status-bar` - Status bar control
- `@capacitor/text-zoom` - Text size accessibility
- `@capacitor-community/keep-awake` - Screen wake lock
- `@capacitor-firebase/authentication` - Firebase auth
- `@capacitor-mlkit/barcode-scanning` - Camera barcode scanning
- `@capawesome-team/capacitor-nfc` - NFC reading/writing
- `@capawesome/capacitor-live-update` - OTA live updates
- `@capgo/capacitor-shake` - Shake detection
- `capacitor-plugin-safe-area` - Safe area insets for notched devices
- `capacitor-zeroconf` - Zeroconf/Bonjour network discovery

### Feature Availability Checks

Always check feature availability before use. Hooks handle this pattern:

- `useNfcAvailabilityCheck()` - Checks NFC support at startup
- `useCameraAvailabilityCheck()` - Checks camera/barcode scanner
- `useAccelerometerAvailabilityCheck()` - Checks shake detection

Results are cached in `preferencesStore`:

```typescript
const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
const cameraAvailable = usePreferencesStore((state) => state.cameraAvailable);
```

### NFC Session Management

Use `withNfcSession()` helper for proper cleanup:

```typescript
// From src/lib/nfc.ts - listeners are automatically cleaned up
await withNfcSession<Result>(async (event) => {
  // Handle tag scan
  return result;
});
```

Key patterns:

- Register all listeners before starting scan (prevents race conditions)
- Store listener handles for cleanup
- Distinguish user cancellation from errors (check error message for "cancelled")
- Call `Nfc.stopScanSession()` to cancel - do NOT call `removeAllListeners()`

### Haptic Feedback

Use the `useHaptics` hook:

```typescript
const { impact, notification, vibrate } = useHaptics();

// Button press feedback
impact("light"); // or "medium", "heavy"

// Notification feedback
notification("success"); // or "warning", "error"

// Simple vibration
vibrate(300); // duration in ms
```

The hook respects user's haptics preference and gracefully handles unsupported platforms.

### Storage

Use Capacitor Preferences, not localStorage:

```typescript
import { Preferences } from "@capacitor/preferences";

// Set
await Preferences.set({ key: "myKey", value: JSON.stringify(data) });

// Get
const { value } = await Preferences.get({ key: "myKey" });
const data = value ? JSON.parse(value) : defaultValue;
```

For app settings, use `preferencesStore` which handles persistence automatically.

## Internationalization (i18n)

### Supported Languages

- English: `en-US` (default), `en`, `en-GB`
- French: `fr-FR`, `fr`
- Chinese: `zh-CN`, `zh`
- Korean: `ko-KR`, `ko`
- Japanese: `ja-JP`, `ja`
- Dutch: `nl-NL`, `nl`
- German: `de-DE`

### Translation Files

Located in `src/translations/*.json`. Structure uses nested objects:

```json
{
  "translation": {
    "nav": {
      "back": "Back",
      "cancel": "Cancel"
    },
    "spinner": {
      "scanning": "Scanning"
    }
  }
}
```

### Usage

```typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

// Simple key
t("nav.back");

// With interpolation
t("error", { msg: "Something went wrong" });
// Translation: "Error: {{msg}}"

// Pluralization
t("duration.hours", { count: 5 });
// Uses "hours_one" for count=1, "hours_other" for count>1
```

### Adding New Translations

1. Add key to `src/translations/en-US.json`
2. ONLY update English translations, never other languages unless asked

### In Tests

Translations are mocked to return keys as-is. Test for translation keys:

```typescript
expect(screen.getByText("nav.back")).toBeInTheDocument();
```

## Component Patterns

### Component Library

Two UI component libraries:

- `src/components/ui/` - shadcn/ui components (Radix-based)
- `src/components/wui/` - Custom Zaparoo components

### wui Component Conventions

- Use `memo()` and `forwardRef()` for performance and ref support
- Use `classnames` for conditional Tailwind classes
- Support accessibility props: `aria-label`, `aria-expanded`, `aria-controls`
- Use semantic `intent` prop for haptic feedback: `"default"` | `"primary"` | `"destructive"`

### Button Pattern

```tsx
<Button
  label="Submit"
  variant="fill" // "fill" | "outline" | "text"
  size="default" // "sm" | "default" | "lg"
  intent="primary" // For haptic feedback intensity
  icon={<Icon />}
  disabled={isDisabled}
  aria-label="Submit form"
  onClick={handleClick}
/>
```

### Card Pattern

```tsx
<Card
  onClick={handleClick} // Makes card interactive (button semantics)
  disabled={isDisabled}
>
  {children}
</Card>
```

### Touch Handling

Interactive components track touch movement to distinguish taps from scrolls:

- Store `touchStartPos` on touch start
- Check if moved >10px during touch move
- Only trigger click if `!hasMoved`

### Styling

- Use Tailwind CSS classes
- Custom CSS variables for colors: `bg-button-pattern`, `bg-card-pattern`
- Focus visible styles: `focus-visible:ring-2 focus-visible:ring-white/50`
- Touch manipulation: `touch-manipulation` class

## State Management

### Main Store (`useStatusStore`)

Connection and runtime state:

```typescript
import { useStatusStore } from "@/lib/store";

// Subscribe to specific state
const connected = useStatusStore((state) => state.connected);
const connectionState = useStatusStore((state) => state.connectionState);

// Actions
const setConnected = useStatusStore((state) => state.setConnected);
```

Key state:

- `connected`, `connectionState`, `connectionError` - Connection status
- `targetDeviceAddress` - Current device IP
- `lastToken`, `gamesIndex`, `playing` - Core API data
- `runQueue`, `writeQueue` - Operation queues
- `deviceHistory` - Previous device connections

### Preferences Store (`usePreferencesStore`)

Persisted settings with Capacitor Preferences:

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

const launchOnScan = usePreferencesStore((state) => state.launchOnScan);
const setLaunchOnScan = usePreferencesStore((state) => state.setLaunchOnScan);
```

Key settings:

- `restartScan`, `launchOnScan` - Scan behavior
- `shakeEnabled`, `shakeMode`, `shakeZapscript` - Shake to launch
- `hapticsEnabled`, `textZoomLevel` - Accessibility
- `tourCompleted` - Onboarding state
- `nfcAvailable`, `cameraAvailable`, `accelerometerAvailable` - Feature flags

### Hydration

Wait for store hydration before showing UI that depends on persisted state:

```typescript
const hasHydrated = usePreferencesStore((state) => state._hasHydrated);

if (!hasHydrated) {
  return <LoadingState />;
}
```

## API Communication

### JSON-RPC Protocol

All Core API communication uses JSON-RPC 2.0:

```typescript
{
  jsonrpc: "2.0",
  id: requestId,
  method: "media.search",
  params: { query: "mario" }
}
```

### CoreAPI Client

```typescript
import { CoreAPI } from "@/lib/coreApi";

// Make API calls
const result = await CoreAPI.getVersion();
const searchResults = await CoreAPI.searchMedia({ query: "mario" });

// Reset state (call after tests)
CoreAPI.reset();
```

### WebSocket Transport

Located in `src/lib/transport/WebSocketTransport.ts`:

- Automatic reconnection with exponential backoff (1s initial, 1.5x multiplier, 30s max)
- Heartbeat ping/pong every 15s with 10s timeout
- Message queuing (up to 100) while disconnected
- State machine: disconnected -> connecting -> connected -> reconnecting

### Queue System

Two queues for operations:

- `runQueue` - Game launch commands (processed by `useRunQueueProcessor`)
- `writeQueue` - NFC write operations (processed by `useWriteQueueProcessor`)

Queues handle offline scenarios - requests are queued and flushed when connected.

## Error Handling

### Error Boundaries

`src/components/ErrorComponent.tsx` displays errors with:

- Error message and stack trace
- Diagnostic info: app version, platform, device, timestamp
- Copy button for error details
- Reload button

### Error Patterns

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", error, {
    category: "api",
    action: "riskyOperation",
    severity: "error",
  });

  // Show user-friendly message
  showRateLimitedErrorToast(t("error", { msg: error.message }));
}
```

### Toast Rate Limiting

Use `showRateLimitedErrorToast()` to prevent toast spam:

```typescript
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

// 2 second cooldown between error toasts
showRateLimitedErrorToast("Error message");
```

## Accessibility

### Required Patterns

1. **Skip Links**: Use `<SkipLink />` for keyboard navigation
2. **Page Heading Focus**: Use `usePageHeadingFocus()` hook for route changes
3. **Screen Reader Announcements**: Use `A11yAnnouncerProvider` and `useA11yAnnounce()`
4. **Semantic HTML**: Use proper roles and ARIA attributes
5. **Keyboard Navigation**: All interactive elements must be keyboard accessible

### Screen Reader Detection

```typescript
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";

const isScreenReaderEnabled = useScreenReaderEnabled();
```

### Text Zoom

Support text zoom for accessibility:

```typescript
const textZoomLevel = usePreferencesStore((state) => state.textZoomLevel);
// Applied via Capacitor TextZoom plugin on native
```

## Code Style

### Imports

Use path alias `@/` for src directory:

```typescript
import { logger } from "@/lib/logger";
import { useHaptics } from "@/hooks/useHaptics";
```

### TypeScript

- Use strict TypeScript - no `any` without justification
- Define interfaces for component props
- Use enums from `src/lib/models.ts` for API methods

### Async/Await

Prefer async/await over raw promises. Handle errors explicitly.

### Hooks

- Prefix with `use`
- Extract complex logic into custom hooks in `src/hooks/`
- Use `useCallback` for functions passed to children
- Use `useMemo` for expensive computations

### File Naming

- Components: PascalCase (`Button.tsx`)
- Hooks: camelCase with use prefix (`useHaptics.ts`)
- Utils/lib: camelCase (`logger.ts`)
- Tests: Match source file + `.test.tsx` suffix

## Pro Features

Pro features are gated behind RevenueCat subscription. The primary Pro feature is "Launch on scan" which allows the phone to act as a wireless reader.

Check Pro access:

```typescript
import { useProAccessCheck } from "@/hooks/useProAccessCheck";

const { hasProAccess, isLoading } = useProAccessCheck();
```

## Common Gotchas

1. **NFC Cancellation**: Detected by checking `error.message.includes("cancelled")` - fragile but necessary
2. **Platform Checks**: Always check `Capacitor.isNativePlatform()` before using native features
3. **Store Hydration**: Wait for `_hasHydrated` before rendering UI that depends on persisted state
4. **Translation Keys**: In tests, translations return keys - test for keys not translated strings
5. **WebSocket Reconnection**: The transport handles reconnection automatically - don't manually reconnect
6. **Safe Area Insets**: Use `safeInsets` from store for notched device padding
7. **Touch vs Click**: wui components handle touch/scroll distinction - don't add extra click handlers

## Live Updates

The app uses Capawesome Cloud for over-the-air (OTA) updates, allowing JS/HTML/CSS changes to be pushed directly to users without app store review.

### How It Works

1. User opens app → syncs with Capawesome Cloud in background
2. If update available → downloads new bundle
3. User closes and reopens app → new version is active

### Configuration

Located in `capacitor.config.ts`:

```typescript
LiveUpdate: {
  appId: "your-app-id",
  autoUpdateStrategy: "background",
  defaultChannel: "production",
  readyTimeout: 10000,
  publicKey: "-----BEGIN PUBLIC KEY-----...",
}
```

### The `useLiveUpdate` Hook

Called in `App.tsx` after successful render:

- Calls `ready()` to signal the app loaded successfully (enables automatic rollback protection)
- Syncs with update server in background

If a bad update is pushed and the app crashes before `ready()` is called, the plugin automatically rolls back to the previous working version.

### Pushing a Live Update

```bash
pnpm live-update
```

This builds the web assets and uploads a signed bundle to Capawesome Cloud.

### When to Use Live Updates vs Store Release

**Live Update** (instant, no review):

- UI bug fixes
- JavaScript logic fixes
- New features using existing native plugins
- Translation updates

**Store Release** (requires app store review):

- Adding/updating Capacitor plugins
- Native code changes (Swift/Kotlin)
- New iOS/Android permissions
- Capacitor version upgrades

### Code Signing

Live updates are signed with a private key (`live-update-private.pem`, gitignored). The app verifies updates using the public key in the config. This prevents unauthorized code injection.

## CI/CD with Capawesome Cloud

The app uses Capawesome Cloud for building iOS and Android binaries.

### Configuration Files

- `capawesome.config.json` - Build commands and app configuration
- `.npmrc` - GitHub Packages auth for `@capawesome-team/capacitor-nfc`

### Build Process

1. Push a git tag (e.g., `v1.9.2`)
2. Capawesome Cloud builds iOS (IPA) and Android (AAB)
3. Artifacts available for download or auto-submission to stores

### Required Secrets in Capawesome Cloud

| Secret                      | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `NPM_TOKEN`                 | GitHub Packages auth for private NFC plugin |
| `FIREBASE_CREDS`            | Web Firebase config (`src/firebase.json`)   |
| `GOOGLE_SERVICES_JSON`      | Android Firebase config                     |
| `GOOGLE_SERVICE_INFO_PLIST` | iOS Firebase config (base64 encoded)        |
| `VITE_GOOGLE_STORE_API`     | RevenueCat Android API key                  |
| `VITE_APPLE_STORE_API`      | RevenueCat iOS API key                      |
| `VITE_ROLLBAR_ACCESS_TOKEN` | Error tracking                              |
| `LIVE_UPDATE_PRIVATE_KEY`   | Live update bundle signing                  |
