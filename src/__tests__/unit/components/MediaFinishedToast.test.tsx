import { render, screen, fireEvent } from '../../../test-utils';
import { describe, it, expect, vi } from 'vitest';
import { MediaFinishedToast } from '../../../components/MediaFinishedToast';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    dismiss: vi.fn()
  }
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => options ? `${key}_${options.count}` : key
  })
}));

vi.mock('@/lib/store', () => ({
  useStatusStore: () => ({
    totalFiles: 5
  })
}));

describe('MediaFinishedToast', () => {
  it('should handle Enter key press to dismiss', () => {
    render(<MediaFinishedToast id="test-id" />);
    
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    
    expect(toast.dismiss).toHaveBeenCalledWith('test-id');
  });
});