import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemsSearchModal } from '@/components/SystemsSearchModal';
import { CoreAPI } from '@/lib/coreApi';
import { vi } from 'vitest';

// Mock the translation hook
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

// Mock CoreAPI
vi.mock('@/lib/coreApi', () => ({
  CoreAPI: {
    systems: vi.fn()
  }
}));

// Mock SlideModal
vi.mock('@/components/SlideModal', () => ({
  SlideModal: ({ children, isOpen, title }: any) =>
    isOpen ? (
      <div data-testid="slide-modal">
        <h1>{title}</h1>
        {children}
      </div>
    ) : null
}));

// Mock TextInput
vi.mock('@/components/wui/TextInput', () => ({
  TextInput: ({ value, setValue, placeholder, type, className }: any) => (
    <input
      data-testid="text-input"
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}));

// Mock Button
vi.mock('@/components/wui/Button', () => ({
  Button: ({ label, onClick, variant, className }: any) => (
    <button
      data-testid="system-button"
      onClick={onClick}
      className={`${variant} ${className}`}
    >
      {label}
    </button>
  )
}));

const mockSystems = {
  systems: [
    { id: 'nes', name: 'Nintendo Entertainment System', category: 'Nintendo' },
    { id: 'snes', name: 'Super Nintendo', category: 'Nintendo' },
    { id: 'genesis', name: 'Sega Genesis', category: 'Sega' },
    { id: 'arcade', name: 'Arcade Games', category: 'Arcade' },
    { id: 'other', name: 'Other System', category: 'Other' }
  ]
};

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('SystemsSearchModal', () => {
  const mockProps = {
    isOpen: true,
    close: vi.fn(),
    onSelect: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render when open', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    expect(screen.getByTestId('slide-modal')).toBeInTheDocument();
    expect(screen.getByText('create.custom.selectSystem')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} isOpen={false} />);

    expect(screen.queryByTestId('slide-modal')).not.toBeInTheDocument();
  });

  it('should render search input', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    const input = screen.getByTestId('text-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'create.search.systemInput');
  });

  it('should show loading state', async () => {
    vi.mocked(CoreAPI.systems).mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('should show error state', async () => {
    vi.mocked(CoreAPI.systems).mockRejectedValue(new Error('API Error'));

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  it('should display systems grouped by category', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Nintendo')).toBeInTheDocument();
      expect(screen.getByText('Sega')).toBeInTheDocument();
      expect(screen.getByText('Arcade')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
    expect(screen.getByText('Super Nintendo')).toBeInTheDocument();
    expect(screen.getByText('Sega Genesis')).toBeInTheDocument();
  });

  it('should filter systems by search text', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
    });

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'nintendo' } });

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
      expect(screen.getByText('Super Nintendo')).toBeInTheDocument();
      expect(screen.queryByText('Sega Genesis')).not.toBeInTheDocument();
    });
  });

  it('should handle system selection', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
    });

    const systemButtons = screen.getAllByTestId('system-button');
    const nesButton = systemButtons.find(button =>
      button.textContent === 'Nintendo Entertainment System'
    );

    expect(nesButton).toBeInTheDocument();
    fireEvent.click(nesButton!);

    expect(mockProps.onSelect).toHaveBeenCalledWith('nes');
    expect(mockProps.close).toHaveBeenCalled();
  });

  it('should handle empty filter results', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
    });

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.queryByText('Nintendo Entertainment System')).not.toBeInTheDocument();
      expect(screen.queryByText('Nintendo')).not.toBeInTheDocument();
    });
  });

  it('should handle systems without category', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Other')).toBeInTheDocument();
      expect(screen.getByText('Other System')).toBeInTheDocument();
    });
  });

  it('should sort categories alphabetically', async () => {
    const systemsWithMultipleCategories = {
      systems: [
        { id: 'zx', name: 'ZX Spectrum', category: 'ZX Systems' },
        { id: 'apple', name: 'Apple II', category: 'Apple' },
        { id: 'commodore', name: 'Commodore 64', category: 'Commodore' }
      ]
    };

    vi.mocked(CoreAPI.systems).mockResolvedValue(systemsWithMultipleCategories);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Commodore')).toBeInTheDocument();
      expect(screen.getByText('ZX Systems')).toBeInTheDocument();
    });

    // Check that categories appear in alphabetical order by looking for category headers specifically
    const categories = ['Apple', 'Commodore', 'ZX Systems'];
    categories.forEach(category => {
      expect(screen.getByText(category)).toBeInTheDocument();
    });

    // Verify the HTML structure has categories in the right order
    const categoryContainers = screen.getAllByRole('generic').filter(el =>
      el.id && el.id.startsWith('category-')
    );

    expect(categoryContainers[0]).toHaveAttribute('id', 'category-Apple');
    expect(categoryContainers[1]).toHaveAttribute('id', 'category-Commodore');
    expect(categoryContainers[2]).toHaveAttribute('id', 'category-ZX Systems');
  });

  it('should handle case-insensitive filtering', async () => {
    vi.mocked(CoreAPI.systems).mockResolvedValue(mockSystems);

    renderWithQueryClient(<SystemsSearchModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
    });

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'NINTENDO' } });

    await waitFor(() => {
      expect(screen.getByText('Nintendo Entertainment System')).toBeInTheDocument();
      expect(screen.getByText('Super Nintendo')).toBeInTheDocument();
      expect(screen.queryByText('Sega Genesis')).not.toBeInTheDocument();
    });
  });
});