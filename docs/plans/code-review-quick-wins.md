# Code Review Summary: Quick Wins & React Best Practices

## 🔴 CRITICAL ISSUES (Fix Immediately)

### 1. **Side Effects During Render Phase**
**File:** `src/components/CoreApiWebSocket.tsx:45-78`
**Issue:** Component performs WebSocket initialization, state updates, and API calls during render
```typescript
// ❌ BAD - Side effects in render
if (coreApiWs !== null) return null;
const deviceAddress = getDeviceAddress(); // Side effect
setConnected(false); // State update in render
```
**Fix:** Move all side effects to `useEffect` hooks, use proper React state management

### 2. **Promise Constructor Anti-pattern**
**File:** `src/lib/coreApi.ts` (lines 209, 233, 246, etc.)
**Issue:** Wrapping already-Promise-returning functions in new Promise constructors
```typescript
// ❌ BAD
return new Promise<VersionResponse>((resolve, reject) => {
  this.call(Method.Version).then(resolve).catch(reject);
});

// ✅ GOOD  
return this.call(Method.Version) as Promise<VersionResponse>;
```

## 🟠 HIGH PRIORITY

### 3. **Missing Effect Dependencies**
**File:** `src/hooks/useRunQueueProcessor.tsx:128-139`
**Issue:** Effect missing dependencies, potential stale closures
```typescript
// ❌ Missing processQueue in deps
useEffect(() => {
  processQueue(runQueue);
}, [launcherAccess, runQueue, /* missing processQueue */]);
```

### 4. **Inefficient Store Selectors**
**File:** `src/components/CoreApiWebSocket.tsx:31-41`
**Issue:** Manual object construction with useShallow is inefficient
```typescript
// ❌ BAD - Creates new object every render
const { setConnected, setConnectionError } = useStatusStore(
  useShallow((state) => ({
    setConnected: state.setConnected,
    setConnectionError: state.setConnectionError
  }))
);

// ✅ GOOD - Individual selectors
const setConnected = useStatusStore((state) => state.setConnected);
```

## 🟡 MEDIUM PRIORITY

### 5. **Global Mutable State**
**File:** `src/components/CoreApiWebSocket.tsx:20`
**Issue:** Global WebSocket variable causes StrictMode/SSR issues
```typescript
// ❌ BAD
let coreApiWs: WebsocketHeartbeatJs | null = null;

// ✅ GOOD - Use useRef or component state
const coreApiWsRef = useRef<WebsocketHeartbeatJs | null>(null);
```

### 6. **Memory Leaks**
**Files:** Multiple hooks (useWriteQueueProcessor, useScanOperations)
**Issue:** Timeouts and listeners not properly cleaned up
```typescript
// ❌ BAD - No cleanup
setTimeout(checkNfcAndWrite, retryInterval);

// ✅ GOOD - Proper cleanup
useEffect(() => {
  const timeoutId = setTimeout(checkNfcAndWrite, retryInterval);
  return () => clearTimeout(timeoutId);
}, []);
```

### 7. **Inline Object Creation**
**File:** `src/routes/settings.index.tsx:139`
**Issue:** Creates new sort function every render
```typescript
// ❌ BAD
.sort((a, b) => (a.address > b.address ? 1 : -1))

// ✅ GOOD - Memoize or move outside render
const sortDevices = useCallback((a, b) => a.address.localeCompare(b.address), []);
```

### 8. **Inconsistent Error Handling**
**Issue:** Mix of console.error, toast notifications, and silent failures
**Fix:** Create centralized error handling hook

## 🔵 LOW PRIORITY

### 9. **File Extension Inconsistency**
**Files:** `useRunQueueProcessor.tsx`, `useWriteQueueProcessor.tsx`
**Issue:** Hooks using `.tsx` without JSX exports
**Fix:** Rename to `.ts` for non-JSX files

### 10. **Mixed Import Patterns**
**Issue:** Inconsistent relative (`../lib/`) vs absolute (`@/`) imports
**Fix:** Standardize on absolute imports throughout

## 🏆 TOP 3 IMMEDIATE FIXES

1. **Refactor CoreApiWebSocket** - Move side effects to useEffect hooks
2. **Remove Promise Constructor Anti-pattern** - Return promises directly from CoreApi methods  
3. **Fix Effect Dependencies** - Add missing dependencies to useEffect arrays

These quick wins will immediately improve React compliance, prevent bugs, and enhance performance with minimal code changes.

## 🎯 Positive Aspects Worth Retaining

- Modern React hooks usage (useEffect, useCallback, useMemo) shows good functional paradigm understanding
- Clear separation of concerns between components, hooks, and API interaction provides modularity
- Well-organized integration with third-party libraries (TanStack Router, Zustand, Capacitor, React Hot Toast)
- Type safety with TypeScript throughout the codebase
- Proper use of Zustand for state management architecture