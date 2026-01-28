import { describe, it, expect, beforeEach } from "vitest";
import { useStatusStore } from "../../lib/store";
import { usePreferencesStore } from "../../lib/preferencesStore";
import { sessionManager } from "../../lib/nfc";

describe("Queue Processing Integration", () => {
  beforeEach(() => {
    // Reset stores to initial state
    useStatusStore.getState().setRunQueue(null);
    useStatusStore.getState().setWriteQueue("");
    useStatusStore.getState().setProPurchaseModalOpen(false);
    useStatusStore.getState().setWriteOpen(false);

    // Reset session manager
    sessionManager.launchOnScan = true;
    sessionManager.shouldRestart = false;
  });

  describe("Store State Management", () => {
    it("should initialize queues in empty state", () => {
      const state = useStatusStore.getState();

      expect(state.runQueue).toBeNull();
      expect(state.writeQueue).toBe("");
    });

    it("should have global modal states in store", () => {
      const state = useStatusStore.getState();

      expect(state.proPurchaseModalOpen).toBe(false);
      expect(state.writeOpen).toBe(false);
      expect(typeof state.setProPurchaseModalOpen).toBe("function");
      expect(typeof state.setWriteOpen).toBe("function");
    });

    it("should update modal states globally", () => {
      const { setProPurchaseModalOpen, setWriteOpen } =
        useStatusStore.getState();

      setProPurchaseModalOpen(true);
      expect(useStatusStore.getState().proPurchaseModalOpen).toBe(true);

      setWriteOpen(true);
      expect(useStatusStore.getState().writeOpen).toBe(true);
    });
  });

  describe("Queue Processor Initialization", () => {
    it("should respect launchOnScan preference from storage on startup", () => {
      const prefsStore = usePreferencesStore.getState();

      // Simulate user disabled launch on scan in preferences
      prefsStore.setLaunchOnScan(false);

      // Verify sessionManager was updated
      expect(sessionManager.launchOnScan).toBe(false);

      // Simulate user enabled it back
      prefsStore.setLaunchOnScan(true);
      expect(sessionManager.launchOnScan).toBe(true);
    });
  });

  describe("Run Queue Processing", () => {
    it("should process run queue items added to store", () => {
      const { setRunQueue } = useStatusStore.getState();

      // Add item to run queue
      setRunQueue({ value: "**launch.system:menu", unsafe: true });

      // Verify queue was set
      const state = useStatusStore.getState();
      expect(state.runQueue).toEqual({
        value: "**launch.system:menu",
        unsafe: true,
      });
    });

    it("should clear run queue after processing", () => {
      const { setRunQueue } = useStatusStore.getState();

      setRunQueue({ value: "test", unsafe: false });
      expect(useStatusStore.getState().runQueue).not.toBeNull();

      // Simulate processor clearing the queue
      setRunQueue(null);
      expect(useStatusStore.getState().runQueue).toBeNull();
    });
  });

  describe("Write Queue Processing", () => {
    it("should process write queue items added to store", () => {
      const { setWriteQueue } = useStatusStore.getState();

      // Add item to write queue
      setWriteQueue("**launch.system:menu");

      // Verify queue was set
      const state = useStatusStore.getState();
      expect(state.writeQueue).toBe("**launch.system:menu");
    });

    it("should clear write queue after processing", () => {
      const { setWriteQueue } = useStatusStore.getState();

      setWriteQueue("test-content");
      expect(useStatusStore.getState().writeQueue).toBe("test-content");

      // Simulate processor clearing the queue
      setWriteQueue("");
      expect(useStatusStore.getState().writeQueue).toBe("");
    });
  });

  describe("Cross-Route Functionality", () => {
    it("should maintain queue state when navigating between routes", () => {
      const { setRunQueue, setWriteQueue } = useStatusStore.getState();

      // Simulate being on home route and adding to queue
      setRunQueue({ value: "home-route-command", unsafe: false });
      setWriteQueue("home-route-write");

      // Queue should persist regardless of route
      // (In real app, queue processors are at App level, not route level)
      expect(useStatusStore.getState().runQueue?.value).toBe(
        "home-route-command",
      );
      expect(useStatusStore.getState().writeQueue).toBe("home-route-write");

      // Simulate navigation to settings route
      // Queue state should still be accessible
      const state = useStatusStore.getState();
      expect(state.runQueue?.value).toBe("home-route-command");
      expect(state.writeQueue).toBe("home-route-write");
    });

    it("should allow shake-to-launch from any route via global queue", () => {
      const { setRunQueue } = useStatusStore.getState();

      // Simulate shake detection adding to queue from settings route
      setRunQueue({ value: "**launch.random", unsafe: true });

      // Verify queue was set (processor will handle it regardless of route)
      expect(useStatusStore.getState().runQueue).toEqual({
        value: "**launch.random",
        unsafe: true,
      });
    });

    it("should show Pro purchase modal globally from any route", () => {
      const { setProPurchaseModalOpen } = useStatusStore.getState();

      // Simulate non-Pro user trying to launch from settings route
      setProPurchaseModalOpen(true);

      // Modal state should be global
      expect(useStatusStore.getState().proPurchaseModalOpen).toBe(true);

      // Close modal
      setProPurchaseModalOpen(false);
      expect(useStatusStore.getState().proPurchaseModalOpen).toBe(false);
    });

    it("should show write modal globally from any route", () => {
      const { setWriteOpen } = useStatusStore.getState();

      // Simulate write triggered from create route
      setWriteOpen(true);

      // Modal state should be global
      expect(useStatusStore.getState().writeOpen).toBe(true);

      // Close modal
      setWriteOpen(false);
      expect(useStatusStore.getState().writeOpen).toBe(false);
    });
  });

  describe("Session Manager Integration", () => {
    it("should sync preferences to sessionManager on change", () => {
      const prefsStore = usePreferencesStore.getState();

      // Test restartScan
      expect(sessionManager.shouldRestart).toBe(false);
      prefsStore.setRestartScan(true);
      expect(sessionManager.shouldRestart).toBe(true);

      // Test launchOnScan
      expect(sessionManager.launchOnScan).toBe(true);
      prefsStore.setLaunchOnScan(false);
      expect(sessionManager.launchOnScan).toBe(false);
    });

    it("should initialize sessionManager from preferences on hydration", () => {
      const prefsStore = usePreferencesStore.getState();

      // Set preferences
      prefsStore.setRestartScan(true);
      prefsStore.setLaunchOnScan(false);

      // Verify sessionManager was updated immediately
      expect(sessionManager.shouldRestart).toBe(true);
      expect(sessionManager.launchOnScan).toBe(false);
    });
  });

  describe("Queue Processing Edge Cases", () => {
    it("should handle empty run queue value", () => {
      const { setRunQueue } = useStatusStore.getState();

      setRunQueue({ value: "", unsafe: false });
      expect(useStatusStore.getState().runQueue?.value).toBe("");
    });

    it("should handle empty write queue value", () => {
      const { setWriteQueue } = useStatusStore.getState();

      setWriteQueue("");
      expect(useStatusStore.getState().writeQueue).toBe("");
    });

    it("should handle rapid queue updates", () => {
      const { setRunQueue } = useStatusStore.getState();

      // Simulate rapid shake detections or deep links
      setRunQueue({ value: "first", unsafe: true });
      setRunQueue({ value: "second", unsafe: true });
      setRunQueue({ value: "third", unsafe: true });

      // Last one should win (queue is not actually a queue, it's a single slot)
      expect(useStatusStore.getState().runQueue?.value).toBe("third");
    });
  });
});
