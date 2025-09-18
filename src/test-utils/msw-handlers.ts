import { ws } from "msw";

// WebSocket handler that matches the actual app URL pattern
export const websocketHandler = ws.link("ws://*/api/v0.1");

export const handlers = [
  websocketHandler.addEventListener("connection", ({ client }) => {
    console.log("MSW: WebSocket connection established");
    
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
          client.send(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            timestamp: Date.now(),
            result: {
              version: "1.0.0-test",
              commit: "abc123"
            }
          }));
        } else if (message.method === "media") {
          client.send(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            timestamp: Date.now(),
            result: {
              database: {
                total_files: 100,
                indexed_files: 95,
                processing: false
              },
              active: []
            }
          }));
        } else if (message.method === "tokens") {
          client.send(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            timestamp: Date.now(),
            result: {
              last: null
            }
          }));
        } else {
          // Generic success response for other methods
          client.send(JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            timestamp: Date.now(),
            result: {}
          }));
        }
      } catch (error) {
        console.error("MSW: Error processing WebSocket message:", error);
      }
    });
  })
];