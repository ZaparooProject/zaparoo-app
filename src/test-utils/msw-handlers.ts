import { ws } from "msw";

// WebSocket handler that matches the actual app URL pattern
export const websocketHandler = ws.link("ws://*/api/v0.1");

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

        // Mock responses for common API calls
        if (message.method === "version") {
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              timestamp: Date.now(),
              result: {
                version: "1.0.0-test",
                commit: "abc123",
              },
            }),
          );
        } else if (message.method === "media") {
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              timestamp: Date.now(),
              result: {
                database: {
                  total_files: 100,
                  indexed_files: 95,
                  processing: false,
                },
                active: [],
              },
            }),
          );
        } else if (message.method === "tokens") {
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              timestamp: Date.now(),
              result: {
                last: null,
              },
            }),
          );
        } else {
          // Generic success response for other methods
          client.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              timestamp: Date.now(),
              result: {},
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
