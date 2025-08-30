import { render, screen, fireEvent } from '../../../test-utils';
import { describe, it, expect, vi } from 'vitest';
import { MediaIndexingToast } from '../../../components/MediaIndexingToast';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    dismiss: vi.fn()
  }
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe('MediaIndexingToast', () => {
  it('should handle Enter key press to dismiss', () => {
    render(<MediaIndexingToast id="test-id" setHideToast={() => {}} />);
    
    const buttons = screen.getAllByRole('button');
    const mainToastArea = buttons[0]; // The div element that should be the main clickable area
    fireEvent.keyDown(mainToastArea, { key: 'Enter' });
    
    expect(toast.dismiss).toHaveBeenCalledWith('test-id');
  });
});