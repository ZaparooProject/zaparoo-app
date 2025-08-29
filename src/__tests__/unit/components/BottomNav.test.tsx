import { render, screen } from '../../../test-utils';
import { BottomNav } from '@/components/BottomNav';
import { useStatusStore } from '@/lib/store';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'nav.index': 'Home',
        'nav.create': 'Create',
        'nav.settings': 'Settings'
      };
      return translations[key] || key;
    }
  })
}));

vi.mock('@/lib/store', () => ({
  useStatusStore: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <div data-testid={`link-${to}`}>{children}</div>
  )
}));

const mockUseStatusStore = vi.mocked(useStatusStore);

describe('BottomNav', () => {
  beforeEach(() => {
    mockUseStatusStore.mockReturnValue({
      bottom: 0,
      right: 0,
      left: 0,
      top: 0
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all navigation buttons', () => {
    render(<BottomNav />);
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});