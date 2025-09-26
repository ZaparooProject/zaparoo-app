import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { CoreAPI } from '../../lib/coreApi';
import type { SearchParams, HistoryResponseEntry } from '../../lib/models';

describe('CoreAPI Improved Types', () => {
  let mockSend: Mock;

  beforeEach(() => {
    mockSend = vi.fn();
    CoreAPI.setSend(mockSend);
    // Mock WebSocket connection as connected so requests are sent immediately
    CoreAPI.setWsInstance({ isConnected: true, send: mockSend } as any);
  });

  describe('SearchParams with maxResults', () => {
    it('should support maxResults parameter matching Zaparoo Core API', async () => {
      // Test that maxResults is properly typed and sent
      const searchParamsWithMax: SearchParams & { maxResults?: number } = {
        query: 'mario',
        systems: ['snes', 'genesis'],
        maxResults: 25
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0][0]);
        expect(request.params.maxResults).toBe(25);
        expect(request.params.systems).toEqual(['snes', 'genesis']);
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { results: [], total: 0 }
        };
        CoreAPI.processReceived({ data: JSON.stringify(response) } as MessageEvent);
      }, 0);

      await CoreAPI.mediaSearch(searchParamsWithMax);
    });

    it('should work without maxResults parameter', async () => {
      const searchParamsBasic: SearchParams = {
        query: 'sonic',
        systems: ['genesis']
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0][0]);
        expect(request.params.maxResults).toBeUndefined();
        expect(request.params.systems).toEqual(['genesis']);
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { results: [], total: 0 }
        };
        CoreAPI.processReceived({ data: JSON.stringify(response) } as MessageEvent);
      }, 0);

      await CoreAPI.mediaSearch(searchParamsBasic);
    });
  });

  describe('HistoryResponseEntry types', () => {
    it('should properly handle all fields from Zaparoo Core API', async () => {
      const coreApiHistoryResponse = {
        entries: [{
          time: '2024-09-24T17:49:42.938167429+08:00',
          type: 'nfc',
          uid: '04a1b2c3d4e5f6',
          text: '**launch.system:snes',
          data: '04a1b2c3',
          success: true
        }]
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0][0]);
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: coreApiHistoryResponse
        };
        CoreAPI.processReceived({ data: JSON.stringify(response) } as MessageEvent);
      }, 0);

      const result = await CoreAPI.history();
      const entry: HistoryResponseEntry = result.entries[0];

      // Verify all fields exist and have correct types
      expect(entry.time).toBe('2024-09-24T17:49:42.938167429+08:00');
      expect(entry.type).toBe('nfc');
      expect(entry.uid).toBe('04a1b2c3d4e5f6');
      expect(entry.text).toBe('**launch.system:snes');
      expect(entry.data).toBe('04a1b2c3');
      expect(entry.success).toBe(true);

      // Type checks
      const timeField: string = entry.time;
      const typeField: string = entry.type;
      const uidField: string = entry.uid;
      const textField: string = entry.text;
      const dataField: string = entry.data;
      const successField: boolean = entry.success;

      expect(timeField).toBeDefined();
      expect(typeField).toBeDefined();
      expect(uidField).toBeDefined();
      expect(textField).toBeDefined();
      expect(dataField).toBeDefined();
      expect(successField).toBeDefined();
    });
  });

  describe('ActiveMedia/PlayingResponse enhancement', () => {
    it('should support enhanced active media fields from Zaparoo Core API', async () => {
      const coreApiMediaResponse = {
        database: {
          exists: true,
          indexing: false
        },
        active: [{
          started: '2024-09-24T17:49:42.938167429+08:00',
          launcherId: 'retroarch',
          systemId: 'snes',
          systemName: 'Super Nintendo Entertainment System',
          mediaPath: '/path/to/mario.sfc',
          mediaName: 'Super Mario World'
        }]
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0][0]);
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: coreApiMediaResponse
        };
        CoreAPI.processReceived({ data: JSON.stringify(response) } as MessageEvent);
      }, 0);

      const result = await CoreAPI.media();

      // Test that we can access the enhanced fields
      const activeMedia = result.active[0];
      expect(activeMedia.systemId).toBe('snes');
      expect(activeMedia.systemName).toBe('Super Nintendo Entertainment System');
      expect(activeMedia.mediaPath).toBe('/path/to/mario.sfc');
      expect(activeMedia.mediaName).toBe('Super Mario World');

      // Test enhanced fields that should be available in core API
      expect((activeMedia as any).started).toBe('2024-09-24T17:49:42.938167429+08:00');
      expect((activeMedia as any).launcherId).toBe('retroarch');
    });
  });

  describe('Launch parameter flexibility', () => {
    it('should support all optional run parameters from Core API', async () => {
      // Test that we can pass all optional parameters that the Core API supports
      const runParamsComplete = {
        type: 'nfc',
        uid: '04a1b2c3d4e5f6',
        text: '**launch.system:snes',
        data: '04a1b2c3',
        unsafe: false
      };

      setTimeout(() => {
        const request = JSON.parse(mockSend.mock.calls[0][0]);
        expect(request.params.type).toBe('nfc');
        expect(request.params.uid).toBe('04a1b2c3d4e5f6');
        expect(request.params.text).toBe('**launch.system:snes');
        expect(request.params.data).toBe('04a1b2c3');
        expect(request.params.unsafe).toBe(false);
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: null
        };
        CoreAPI.processReceived({ data: JSON.stringify(response) } as MessageEvent);
      }, 0);

      await CoreAPI.run(runParamsComplete);
    });
  });
});