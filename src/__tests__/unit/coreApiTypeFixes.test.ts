import { describe, it, expect } from 'vitest';
import type { HistoryResponseEntry, SearchParams, SettingsResponse } from '../../lib/models';

describe('CoreAPI Type Fixes', () => {
  describe('HistoryResponseEntry Interface', () => {
    it('should include type and data fields required by Zaparoo Core API', () => {
      // Create a complete object according to the Zaparoo Core API spec
      const mockHistoryEntry: HistoryResponseEntry = {
        time: '2024-09-24T17:49:42.938167429+08:00',
        type: 'nfc',
        uid: 'abc123',
        text: '**launch.system:snes',
        data: '04a1b2c3',
        success: true
      };

      // These should compile without errors now that type and data exist in the interface
      const tokenType: string = mockHistoryEntry.type;
      const tokenData: string = mockHistoryEntry.data;

      expect(tokenType).toBe('nfc');
      expect(tokenData).toBe('04a1b2c3');
    });
  });

  describe('SearchParams Interface', () => {
    it('should include optional maxResults field for Core API compatibility', () => {
      // Test that maxResults can be used as a parameter
      const basicSearch: SearchParams = {
        query: 'mario',
        systems: ['snes']
      };

      const advancedSearch: SearchParams = {
        query: 'mario',
        systems: ['snes'],
        maxResults: 50  // This should be allowed as optional field
      };

      // Test that we can work with maxResults as a typed optional field
      function processSearchParams(params: SearchParams): number {
        return params.maxResults ?? 250;  // Default from Core API spec
      }

      expect(processSearchParams(basicSearch)).toBe(250);
      expect(processSearchParams(advancedSearch)).toBe(50);
    });
  });

  describe('SettingsResponse Scan Mode', () => {
    it('should support insert scan mode from Core API specification', () => {
      // Test all scan modes supported by Zaparoo Core API
      const settingsWithInsert: SettingsResponse = {
        runZapScript: true,
        debugLogging: false,
        audioScanFeedback: true,
        readersAutoDetect: true,
        readersScanMode: 'insert',  // This should be valid according to Core API
        readersScanExitDelay: 0.5,
        readersScanIgnoreSystems: ['DOS']
      };

      const settingsWithTap: SettingsResponse = {
        runZapScript: true,
        debugLogging: false,
        audioScanFeedback: true,
        readersAutoDetect: true,
        readersScanMode: 'tap',
        readersScanExitDelay: 0.5,
        readersScanIgnoreSystems: []
      };

      const settingsWithHold: SettingsResponse = {
        runZapScript: true,
        debugLogging: false,
        audioScanFeedback: true,
        readersAutoDetect: true,
        readersScanMode: 'hold',
        readersScanExitDelay: 0.5,
        readersScanIgnoreSystems: []
      };

      expect(settingsWithInsert.readersScanMode).toBe('insert');
      expect(settingsWithTap.readersScanMode).toBe('tap');
      expect(settingsWithHold.readersScanMode).toBe('hold');
    });
  });
});