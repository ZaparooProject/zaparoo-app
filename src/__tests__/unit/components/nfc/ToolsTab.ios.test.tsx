import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolsTab } from '@/components/nfc/ToolsTab';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'create.nfc.format': 'Format Tag',
        'create.nfc.erase': 'Erase Tag',
        'create.nfc.makeReadOnly': 'Make Read-Only',
        'create.nfc.tools.formatDescription': 'Prepare tag for writing',
        'create.nfc.tools.formatWarning': 'This will erase all data',
        'create.nfc.tools.eraseDescription': 'Remove all data from tag',
        'create.nfc.tools.eraseWarning': 'This action cannot be undone',
        'create.nfc.tools.makeReadOnlyDescription': 'Prevent further modifications',
        'create.nfc.tools.makeReadOnlyWarning': 'This cannot be reversed',
        'loading': 'Loading...'
      };
      return translations[key] || key;
    }
  })
}));

// Mock Capacitor for iOS platform
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'ios')
  }
}));

describe('ToolsTab on iOS', () => {
  const mockOnToolAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('platform-specific filtering', () => {
    it('should hide Format tool on iOS platform', () => {
      render(<ToolsTab onToolAction={mockOnToolAction} isProcessing={false} />);

      // The "Format" tool should not be visible on iOS (it's Android-only)
      expect(screen.queryByText('Format Tag')).not.toBeInTheDocument();

      // The other tools should be visible (they support both platforms)
      expect(screen.getAllByText('Erase Tag')).toHaveLength(2); // heading + button
      expect(screen.getAllByText('Make Read-Only')).toHaveLength(2); // heading + button
    });
  });
});