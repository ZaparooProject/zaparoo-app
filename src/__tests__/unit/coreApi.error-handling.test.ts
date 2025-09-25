import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "@/lib/coreApi";

describe("CoreAPI Error Handling Coverage", () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockClear();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  afterEach(() => {
    CoreAPI.reset();
  });

  describe("mediaActiveUpdate error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      // Mock send to simulate API failure
      const mockError = new Error("API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // This should trigger the catch block on line 828
      await expect(
        CoreAPI.mediaActiveUpdate({
          systemId: "test-system",
          mediaPath: "/test/path",
          mediaName: "Test Media"
        })
      ).rejects.toThrow("API call failed");

      // Check that the specific error handler we're targeting was called
      expect(consoleSpy).toHaveBeenCalledWith(
        "Media active update API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("settingsReload error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      // Mock send to simulate API failure
      const mockError = new Error("Settings reload failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // This should trigger the catch block on lines 841-842
      await expect(CoreAPI.settingsReload()).rejects.toThrow("Settings reload failed");

      // Check that the specific error handler we're targeting was called
      expect(consoleSpy).toHaveBeenCalledWith(
        "Settings reload API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("run method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Run API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.run({ text: "test" })).rejects.toThrow("Run API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Run API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("history method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("History API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.history()).rejects.toThrow("History API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "History API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("mediaSearch method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Media search API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.mediaSearch({ query: "test", systems: ["snes"] })).rejects.toThrow("Media search API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Media search API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("mediaGenerate error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Media generate API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.mediaGenerate()).rejects.toThrow("Media generate API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Media generate API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("systems method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Systems API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.systems()).rejects.toThrow("Systems API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Systems API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("settings method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Settings API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.settings()).rejects.toThrow("Settings API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Settings API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("settingsUpdate error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Settings update API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.settingsUpdate({ debugLogging: true })).rejects.toThrow("Settings update API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Settings update API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("mappings method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Mappings API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.mappings()).rejects.toThrow("Mappings API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Mappings API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("newMapping error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("New mapping API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.newMapping({ label: "test", enabled: true, type: "text", match: "test", pattern: "test", override: "test" })).rejects.toThrow("New mapping API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "New mapping API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("updateMapping error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Update mapping API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.updateMapping({ id: 1, label: "test" })).rejects.toThrow("Update mapping API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Update mapping API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("deleteMapping error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Delete mapping API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.deleteMapping({ id: 1 })).rejects.toThrow("Delete mapping API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Delete mapping API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("mappingsReload error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Mappings reload API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.mappingsReload()).rejects.toThrow("Mappings reload API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Mappings reload API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("media method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Media API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.media()).rejects.toThrow("Media API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Media API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("tokens method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Tokens API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.tokens()).rejects.toThrow("Tokens API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Tokens API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("stop method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Stop API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.stop()).rejects.toThrow("Stop API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Stop API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("mediaActive error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Media active API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.mediaActive()).rejects.toThrow("Media active API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Media active API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("readers method error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Readers API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.readers()).rejects.toThrow("Readers API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Readers API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("readersWriteCancel error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Readers write cancel API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(CoreAPI.readersWriteCancel()).rejects.toThrow("Readers write cancel API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Readers write cancel API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("launchersRefresh error handling", () => {
    it("should handle API call failures and reject with error", async () => {
      const mockError = new Error("Launchers refresh API call failed");
      mockSend.mockImplementationOnce(() => {
        throw mockError;
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect((CoreAPI as any).launchersRefresh()).rejects.toThrow("Launchers refresh API call failed");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Launchers refresh API call failed:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});