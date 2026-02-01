# Testing Guide

This is the comprehensive testing guide for the Zaparoo App codebase. For quick reference, see [AGENTS.md](../AGENTS.md#testing).

## Testing Philosophy

### The Testing Trophy Model

Tests follow the "Testing Trophy" model, prioritizing integration tests for maximum ROI:

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

### What Each Level Owns

| Level       | Owns                                              | Examples                                           |
| ----------- | ------------------------------------------------- | -------------------------------------------------- |
| Static      | Type errors, syntax, code style                   | TypeScript errors, ESLint violations               |
| Unit        | Pure functions, utilities, validators, edge cases | `formatDate()`, `validateEmail()`, store selectors |
| Integration | Component + state + API behavior                  | Form submission, modal interactions, search flows  |
| Validation  | Configuration correctness                         | Tour config validation                             |

### Why Integration Tests Have Highest ROI

1. **User-centric**: Tests the actual user experience, not internal implementation
2. **Refactor-friendly**: Less brittle when implementation changes
3. **Bug detection**: Catches integration bugs that unit tests miss
4. **Confidence**: Proves multiple parts work together correctly
5. **Maintenance**: Fewer tests needed to achieve same confidence

---

## Test Organization

### Directory Structure

```
src/__tests__/
  unit/              # Individual components, hooks, utilities
    components/      # Component unit tests
    hooks/           # Hook tests
    lib/             # Utility/library tests
    routes/          # Route component tests
  integration/       # Feature flows and interactions
  validation/        # Configuration validation tests
```

### File Naming

- `ComponentName.test.tsx` - General tests for a component
- `ComponentName.ios.test.tsx` - iOS-specific tests
- `hookName.test.ts` - Hook tests (non-JSX)
- `utility.test.ts` - Utility function tests

---

## Test Structure & Naming

### AAA Pattern (Arrange-Act-Assert)

Every test should follow this structure:

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

### Test Naming Conventions

Use `should + verb` format describing behavior from the user's perspective:

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

### Describe Block Organization

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

---

## Test Setup

### Environment Configuration

Configured in `vitest.config.ts` and `src/test-setup.ts`:

- **Environment**: happy-dom
- **Global mocks**: i18n (returns keys as-is), WebSocket, matchMedia, IntersectionObserver
- **MSW handlers**: `src/test-utils/msw-handlers.ts` for API mocking
- **Custom render**: `src/test-utils/index.tsx` wraps with providers

### Import from test-utils

```typescript
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

### Automatic Cleanup

The setup automatically handles after each test:

- `CoreAPI.reset()` - Reset API client state
- `vi.clearAllTimers()` and `vi.useRealTimers()` - Timer cleanup
- `server.resetHandlers()` - MSW handler reset
- React Testing Library cleanup

---

## Query Priority (React Testing Library)

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

### Query Variants

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

---

## User Interactions

### Always Use userEvent.setup()

`userEvent` simulates real user behavior more accurately than `fireEvent`:

```typescript
it("should submit form on button click", async () => {
  const user = userEvent.setup();
  const handleSubmit = vi.fn();
  render(<Form onSubmit={handleSubmit} />);

  await user.type(screen.getByLabelText(/email/i), "test@example.com");
  await user.click(screen.getByRole("button", { name: /submit/i }));

  expect(handleSubmit).toHaveBeenCalledWith({ email: "test@example.com" });
});
```

### userEvent vs fireEvent

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

// Use fireEvent only when necessary (e.g., scroll)
import { fireEvent } from "@testing-library/react";
fireEvent.scroll(container, { target: { scrollY: 100 } });
```

---

## Async Testing Patterns

### Proper waitFor Usage

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

### Testing Loading States

```typescript
it("should show loading then content", async () => {
  render(<AsyncComponent />);

  // Loading state appears immediately
  expect(screen.getByRole("progressbar")).toBeInTheDocument();

  // Content appears after loading
  expect(await screen.findByText("Content loaded")).toBeInTheDocument();

  // Loading indicator should be gone
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
```

### Testing Error States

```typescript
it("should show error when API fails", async () => {
  server.use(
    http.post("*/api", () => {
      return HttpResponse.json(
        { jsonrpc: "2.0", id: 1, error: { message: "Server error" } },
        { status: 500 }
      );
    })
  );

  render(<DataComponent />);

  expect(await screen.findByRole("alert")).toHaveTextContent(/error/i);
});
```

---

## Zustand Store Testing

### Testing Components That Use Stores

```typescript
import { useStatusStore } from "@/lib/store";
import { act } from "@testing-library/react";

beforeEach(() => {
  // Reset store to initial state before each test
  useStatusStore.setState({
    connected: false,
    connectionState: ConnectionState.IDLE,
    // ... other initial values
  });
});

it("should update UI when connection state changes", async () => {
  render(<ConnectionStatus />);

  expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

  act(() => {
    useStatusStore.getState().setConnected(true);
  });

  expect(screen.getByText(/connected/i)).toBeInTheDocument();
});
```

### Testing Store Actions

```typescript
import { useStatusStore } from "@/lib/store";
import { act } from "@testing-library/react";

describe("useStatusStore", () => {
  beforeEach(() => {
    useStatusStore.setState({
      runQueue: null,
      // ... reset other state
    });
  });

  it("should set run queue item", () => {
    act(() => {
      useStatusStore
        .getState()
        .setRunQueue({ value: "game.launch", unsafe: false });
    });

    expect(useStatusStore.getState().runQueue).toEqual({
      value: "game.launch",
      unsafe: false,
    });
  });

  it("should clear queue by setting to null", () => {
    // Setup
    act(() => {
      useStatusStore.getState().setRunQueue({ value: "item1", unsafe: false });
    });

    // Clear
    act(() => {
      useStatusStore.getState().setRunQueue(null);
    });

    expect(useStatusStore.getState().runQueue).toBeNull();
  });
});
```

### Testing Preferences Store

```typescript
import { usePreferencesStore } from "@/lib/preferencesStore";

beforeEach(() => {
  usePreferencesStore.setState({
    hapticsEnabled: true,
    launchOnScan: false,
    _hasHydrated: true, // Mark as hydrated for tests
    // ... other preferences
  });
});

it("should update preference and reflect in component", async () => {
  render(<SettingsPanel />);

  const user = userEvent.setup();
  await user.click(screen.getByRole("switch", { name: /haptics/i }));

  expect(usePreferencesStore.getState().hapticsEnabled).toBe(false);
});
```

---

## MSW Best Practices

### Factory Functions

Use `mockReaderInfo` from `src/test-utils/factories.ts`:

```typescript
import { mockReaderInfo } from "../../../test-utils/factories";

const reader = mockReaderInfo({ connected: true }); // Override specific fields
```

### Default vs Per-Test Handlers

Default handlers in `src/test-utils/msw-handlers.ts` provide happy-path responses. Override for specific scenarios:

```typescript
import { server } from "../../test-setup";
import { http, HttpResponse, delay } from "msw";

it("should show error on API failure", async () => {
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

### Testing Network States

```typescript
// Test loading state with delayed response
it("should show loading indicator", async () => {
  server.use(
    http.post("*/api", async () => {
      await delay(100);
      return HttpResponse.json({ jsonrpc: "2.0", id: 1, result: data });
    })
  );

  render(<DataComponent />);
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(await screen.findByText("Data loaded")).toBeInTheDocument();
});

// Test network error
it("should handle network failure", async () => {
  server.use(
    http.post("*/api", () => HttpResponse.error())
  );

  render(<DataComponent />);
  expect(await screen.findByText(/connection failed/i)).toBeInTheDocument();
});
```

---

## Flaky Test Prevention

### Common Causes and Solutions

| Cause                         | Solution                                                |
| ----------------------------- | ------------------------------------------------------- |
| Race conditions               | Use `findBy*` queries, `waitFor`, proper async/await    |
| Shared state between tests    | Reset stores and mocks in `beforeEach`                  |
| Timer-dependent code          | Use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` |
| Random/non-deterministic data | Use factory functions with fixed values                 |
| Animation timing              | Mock or disable animations; use `waitFor`               |
| External dependencies         | Mock at module level, not inside tests                  |

### Timer Testing

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("should auto-hide toast after 3 seconds", async () => {
  render(<Toast message="Hello" />);

  expect(screen.getByText("Hello")).toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(3000);
  });

  expect(screen.queryByText("Hello")).not.toBeInTheDocument();
});

it("should debounce search input", async () => {
  const onSearch = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  render(<SearchInput onSearch={onSearch} debounceMs={300} />);

  await user.type(screen.getByRole("searchbox"), "test");

  expect(onSearch).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onSearch).toHaveBeenCalledWith("test");
});
```

### Avoiding Test Pollution

```typescript
describe("FeatureComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStatusStore.setState({
      connected: false,
      // ... reset all state
    });
    usePreferencesStore.setState({
      hapticsEnabled: true,
      _hasHydrated: true,
      // ... reset all preferences
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Tests are now isolated...
});
```

---

## Accessibility Testing

### Use Accessible Queries

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

### Testing ARIA States

```typescript
it("should have correct ARIA states", async () => {
  render(<ExpandableSection title="Details" />);

  const button = screen.getByRole("button", { name: /details/i });
  const content = screen.getByRole("region");

  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(content).not.toBeVisible();

  await userEvent.click(button);

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

### Testing Focus Management

```typescript
it("should focus first element when modal opens", async () => {
  const user = userEvent.setup();
  render(<ModalTrigger />);

  await user.click(screen.getByRole("button", { name: /open modal/i }));

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

### Testing Keyboard Navigation

```typescript
it("should support keyboard navigation", async () => {
  const user = userEvent.setup();
  render(<TabList tabs={["Tab 1", "Tab 2", "Tab 3"]} />);

  const tab1 = screen.getByRole("tab", { name: "Tab 1" });
  tab1.focus();

  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveFocus();

  await user.keyboard("{ArrowLeft}");
  expect(tab1).toHaveFocus();
});
```

---

## Component Testing Patterns

### Testing Forms

```typescript
it("should validate and submit form", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<ContactForm onSubmit={onSubmit} />);

  // Submit empty - validation errors
  await user.click(screen.getByRole("button", { name: /send/i }));

  expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();

  // Fill valid data
  await user.type(screen.getByLabelText(/name/i), "John Doe");
  await user.type(screen.getByLabelText(/email/i), "john@example.com");

  await user.click(screen.getByRole("button", { name: /send/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    name: "John Doe",
    email: "john@example.com",
  });
});
```

### Testing Conditional Rendering

```typescript
it("should show pro features only when user has access", () => {
  const { rerender } = render(<FeaturePanel hasProAccess={false} />);

  expect(screen.queryByText(/launch on scan/i)).not.toBeInTheDocument();
  expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();

  rerender(<FeaturePanel hasProAccess={true} />);

  expect(screen.getByText(/launch on scan/i)).toBeInTheDocument();
  expect(screen.queryByText(/upgrade to pro/i)).not.toBeInTheDocument();
});
```

### Testing Hooks

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
});
```

---

## Critical Anti-Patterns

The following patterns have caused significant test quality issues. **Do not use them.**

### 1. NEVER create fake components inside test files

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

### 2. Don't over-mock

```typescript
// ❌ BAD - Mocks the component being tested
vi.mock("@/components/Button", () => ({ Button: () => <button>Mock</button> }));

// ✅ GOOD - Mock only external dependencies (APIs, native plugins)
vi.mock("@capacitor/preferences", () => ({ Preferences: { get: vi.fn() } }));
```

### 3. Use parameterized tests for repetitive patterns

```typescript
// ❌ BAD - Copy-paste tests
it("handles error A", () => { /* same pattern */ });
it("handles error B", () => { /* same pattern */ });

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
  await user.tab();

  expect(screen.getByRole("alert")).toHaveTextContent(expectedError);
});
```

### 4. Don't test TypeScript or library behavior

```typescript
// ❌ BAD - Tests TypeScript enums exist
expect(ApiMethod.Run).toBe("run");

// ❌ BAD - Tests Zustand library behavior
const store = create(() => ({ count: 0 }));
expect(store.getState().count).toBe(0);
```

### 5. Don't test CSS classes or DOM structure

```typescript
// ❌ BAD - Implementation detail
expect(document.querySelector(".lucide-icon")).toBeInTheDocument();

// ✅ GOOD - Test accessible behavior
expect(screen.getByRole("img", { name: "Warning" })).toBeInTheDocument();
```

### 6. Never use hardcoded delays

```typescript
// ❌ BAD - Flaky, slow
await new Promise((resolve) => setTimeout(resolve, 1000));

// ✅ GOOD - Wait for actual condition
await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
```

### 7. Don't write placeholder tests

```typescript
// ❌ BAD - Provides no value
it("should work", () => {
  expect(true).toBe(true);
});
```

### 8. Don't test that imports exist

```typescript
// ❌ BAD - Tests nothing useful
it("should export hook", () => {
  expect(typeof useScanOperations).toBe("function");
});
```

### 9. Don't read and regex source files

```typescript
// ❌ BAD - Fragile, tests source text not behavior
const source = fs.readFileSync("src/component.tsx", "utf8");
expect(source).toMatch(/aria-label/);
```

### 10. Don't duplicate test logic from source

```typescript
// ❌ BAD - Duplicates implementation
const calculateExpected = (a, b) => a + b;
expect(add(1, 2)).toBe(calculateExpected(1, 2));

// ✅ GOOD - Test with known expected values
expect(add(1, 2)).toBe(3);
```

### Additional Rules

- **Don't duplicate test suites** - if two describe blocks assert the same things, consolidate them
- **Don't use `vi.doMock` after imports** - it won't work. Use `vi.mock` at top of file
- **Never use `@ts-expect-error` to test invalid props** - TypeScript prevents this at compile time

---

## What Makes a Valid Test

A test is **valid** if it:

1. Imports and renders REAL components from `src/`
2. Tests observable behavior (what users see/interact with)
3. Would fail if the feature broke in production
4. Doesn't duplicate another test's assertions

A test is **INVALID** if it:

1. Creates fake components inside the test file
2. Mocks the component being tested
3. Only tests mock implementations
4. Tests CSS classes or internal DOM structure
5. Duplicates another test with different wording

---

## Test Checklist

Before submitting tests, verify:

- [ ] Imports real component/hook from `src/`
- [ ] Only mocks external dependencies (APIs, native plugins, Capacitor)
- [ ] Uses accessible queries (`getByRole`, `getByLabelText`, etc.)
- [ ] Tests observable behavior, not implementation details
- [ ] Would fail if the feature actually broke
- [ ] Has both positive and negative assertions where applicable
- [ ] Uses `mockReaderInfo` from `test-utils/factories.ts` for mock data
- [ ] Properly cleans up with `beforeEach`/`afterEach`
- [ ] Uses `userEvent.setup()` for user interactions
- [ ] Uses `findBy*` or `waitFor` for async content
- [ ] No hardcoded delays or sleeps
