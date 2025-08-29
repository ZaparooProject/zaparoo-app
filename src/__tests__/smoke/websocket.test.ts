import { describe, it, expect } from "vitest";
import { server } from "../../test-setup";

describe("WebSocket MSW Setup", () => {
  it("should have MSW server available", () => {
    expect(server).toBeDefined();
  });
  
  it("should handle WebSocket connections with correct URL pattern", async () => {
    const ws = new WebSocket("ws://localhost:7497/api/v0.1");
    
    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        reject(error);
      };
      
      setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 1000);
    });
  });
  
  it("should handle ping/pong heartbeat", async () => {
    const ws = new WebSocket("ws://localhost:7497/api/v0.1");
    
    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        ws.send("ping");
      };
      
      ws.onmessage = (event) => {
        expect(event.data).toBe("pong");
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        reject(error);
      };
      
      setTimeout(() => {
        reject(new Error("Heartbeat timeout"));
      }, 1000);
    });
  });
});