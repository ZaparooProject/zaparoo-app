import { render, screen, fireEvent } from '../../../test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopyButton } from '../../../components/CopyButton';
import { Capacitor } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn()
  }
}));

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    write: vi.fn()
  }
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Capacitor.isNativePlatform as any).mockReturnValue(true);
  });

  it('should handle Enter key press', () => {
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    
    expect(button).toBeInTheDocument();
  });
});