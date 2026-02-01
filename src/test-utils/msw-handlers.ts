import { ws } from "msw";

// WebSocket handler that matches the actual app URL pattern
export const websocketHandler = ws.link("ws://*/api/v0.1");

/**
 * Default mock responses for API methods.
 * These match the expected response types from src/lib/models.ts
 */
const mockResponses: Record<string, unknown> = {
  // Version info
  version: {
    version: "1.0.0-test",
    platform: "linux",
  },

  // Media database info
  media: {
    database: {
      exists: true,
      indexing: false,
      totalSteps: 100,
      currentStep: 100,
      totalFiles: 100,
      totalMedia: 95,
    },
    active: [],
  },

  // Token state
  tokens: {
    active: [],
    last: null,
  },

  // Token history
  "tokens.history": {
    entries: [],
  },

  // Systems list
  systems: {
    systems: [
      { id: "nes", name: "Nintendo Entertainment System", category: "console" },
      { id: "snes", name: "Super Nintendo", category: "console" },
      { id: "genesis", name: "Sega Genesis", category: "console" },
    ],
  },

  // Media search
  "media.search": {
    results: [],
    total: 0,
    pagination: {
      nextCursor: null,
      hasNextPage: false,
      pageSize: 50,
    },
  },

  // Media tags
  "media.tags": {
    tags: [],
  },

  // Readers
  readers: {
    readers: [],
  },

  // Settings
  settings: {
    runZapScript: true,
    debugLogging: false,
    audioScanFeedback: true,
    readersAutoDetect: true,
    readersScanMode: "tap",
    readersScanExitDelay: 0,
    readersScanIgnoreSystems: [],
  },

  // Mappings
  mappings: {
    mappings: [],
  },

  // Run command
  run: {
    success: true,
  },

  // Stop command
  stop: {
    success: true,
  },

  // Playtime
  playtime: {
    state: "reset",
    sessionActive: false,
    limitsEnabled: false,
    sessionDuration: "0s",
    dailyUsageToday: "0s",
  },

  // Playtime limits
  "settings.playtime.limits": {
    enabled: false,
    daily: "2h",
    session: "1h",
    sessionReset: "30m",
    warnings: ["5m", "1m"],
    retention: 30,
  },

  // Playtime limits update
  "settings.playtime.limits.update": {
    success: true,
  },

  // Media generation
  "media.generate": {
    success: true,
    jobId: "test-job-id",
  },

  "media.generate.cancel": {
    success: true,
  },

  "media.active": {
    active: [],
  },

  "media.active.update": {
    success: true,
  },

  // Settings management
  "settings.update": {
    success: true,
  },

  "settings.reload": {
    success: true,
  },

  "settings.logs.download": {
    success: true,
    url: "https://example.com/logs.zip",
  },

  // Launchers
  "launchers.refresh": {
    success: true,
  },

  // Mappings
  "mappings.new": {
    success: true,
    id: "new-mapping-id",
  },

  "mappings.delete": {
    success: true,
  },

  "mappings.update": {
    success: true,
  },

  "mappings.reload": {
    success: true,
  },

  // Readers
  "readers.write": {
    success: true,
  },

  "readers.write.cancel": {
    success: true,
  },
};

export const handlers = [
  websocketHandler.addEventListener("connection", ({ client }) => {
    // Handle ping messages for heartbeat
    client.addEventListener("message", (event) => {
      if (event.data === "ping") {
        client.send("pong");
        return;
      }

      try {
        const message = JSON.parse(event.data.toString());

        // Look up mock response by method name
        const result = mockResponses[message.method];

        if (result !== undefined) {
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              timestamp: Date.now(),
              result,
            }),
          );
        } else {
          // Return JSON-RPC error for unhandled methods to catch typos and missing handlers
          console.warn(
            `[MSW] Unhandled API method: "${message.method}" - add it to mockResponses or create a test-specific handler`,
          );
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32601,
                message: `Method not found: ${message.method}`,
              },
            }),
          );
        }
      } catch (error) {
        // Log warning and return JSON-RPC error for debugging
        console.warn("[MSW] Failed to parse WebSocket message:", error);
        client.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error",
            },
          }),
        );
      }
    });
  }),
];

/**
 * Export mock responses for tests that need to verify expected values
 */
export { mockResponses };

/**
 * Creates a WebSocket handler that returns custom responses for specific methods.
 * Use with server.use() to override default responses in tests.
 *
 * @param overrides - Object mapping method names to their responses or errors
 * @example
 * // Return error for media.search
 * server.use(createMethodOverrideHandler({
 *   "media.search": { error: { code: -32000, message: "Database unavailable" } }
 * }));
 *
 * // Return custom success response
 * server.use(createMethodOverrideHandler({
 *   "media.search": { result: { results: [...], total: 5, pagination: {...} } }
 * }));
 */
export function createMethodOverrideHandler(
  overrides: Record<
    string,
    | { result: unknown }
    | { error: { code: number; message: string; data?: unknown } }
  >,
) {
  return ws
    .link("ws://*/api/v0.1")
    .addEventListener("connection", ({ client }) => {
      client.addEventListener("message", (event) => {
        if (event.data === "ping") {
          client.send("pong");
          return;
        }

        try {
          const message = JSON.parse(event.data.toString());
          const override = overrides[message.method];

          if (override) {
            if ("error" in override) {
              client.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: message.id,
                  error: override.error,
                }),
              );
            } else {
              client.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: message.id,
                  timestamp: Date.now(),
                  result: override.result,
                }),
              );
            }
            return;
          }

          // Fall through to default response handling
          const result = mockResponses[message.method];
          if (result !== undefined) {
            client.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                timestamp: Date.now(),
                result,
              }),
            );
          } else {
            client.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                error: {
                  code: -32601,
                  message: `Method not found: ${message.method}`,
                },
              }),
            );
          }
        } catch {
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32700,
                message: "Parse error",
              },
            }),
          );
        }
      });
    });
}
