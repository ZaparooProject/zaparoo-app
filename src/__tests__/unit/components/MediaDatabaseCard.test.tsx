import { render, screen, fireEvent } from '../../../test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaDatabaseCard } from '../../../components/MediaDatabaseCard';

// Mock dependencies
vi.mock('../../../lib/coreApi', () => ({
  CoreAPI: {
    mediaGenerate: vi.fn(),
    media: vi.fn()
  }
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'toast.filesFound' && options?.count) {
        return `${options.count} media found`;
      }
      return key;
    }
  })
}));

// Mock React Query
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useQuery: vi.fn()
  };
});

// Mock zustand store
const mockStore = {
  connected: true,
  gamesIndex: {
    indexing: false,
    exists: true,
    totalFiles: 100,
    currentStep: 0,
    totalSteps: 0,
    currentStepDisplay: ''
  }
};

vi.mock('../../../lib/store', () => ({
  useStatusStore: (selector: any) => selector(mockStore)
}));

describe('MediaDatabaseCard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mock store state
    mockStore.connected = true;
    mockStore.gamesIndex = {
      indexing: false,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 0,
      currentStepDisplay: ''
    };

    // Default useQuery mock - database exists and ready
    const { useQuery } = await import('@tanstack/react-query');
    vi.mocked(useQuery).mockReturnValue({
      data: {
        database: { exists: true, indexing: false },
        active: []
      },
      isLoading: false,
      error: null
    });
  });

  it('should render update button when not indexing', () => {
    render(<MediaDatabaseCard />);

    const button = screen.getByRole('button', { name: /settings\.updateDb/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('should disable button when not connected', () => {
    mockStore.connected = false;

    render(<MediaDatabaseCard />);

    const button = screen.getByRole('button', { name: /settings\.updateDb/i });
    expect(button).toBeDisabled();
  });

  it('should disable button when indexing', () => {
    mockStore.gamesIndex.indexing = true;

    render(<MediaDatabaseCard />);

    const button = screen.getByRole('button', { name: /settings\.updateDb/i });
    expect(button).toBeDisabled();
  });

  it('should call CoreAPI.mediaGenerate when button is clicked', async () => {
    const { CoreAPI } = await import('../../../lib/coreApi');

    render(<MediaDatabaseCard />);

    const button = screen.getByRole('button', { name: /settings\.updateDb/i });
    fireEvent.click(button);

    expect(CoreAPI.mediaGenerate).toHaveBeenCalledOnce();
  });

  it('should show ready status when database exists (no file count)', () => {
    render(<MediaDatabaseCard />);

    expect(screen.getByText('settings.updateDb.status.ready')).toBeInTheDocument();
  });

  it('should not show file count in card status', () => {
    // File count should never appear in the card, only in toast
    mockStore.gamesIndex.totalFiles = 250;

    render(<MediaDatabaseCard />);

    expect(screen.queryByText('250 media found')).not.toBeInTheDocument();
    expect(screen.getByText('settings.updateDb.status.ready')).toBeInTheDocument();
  });

  it('should show error message when database does not exist', async () => {
    const { useQuery } = await import('@tanstack/react-query');
    vi.mocked(useQuery).mockReturnValue({
      data: {
        database: { exists: false, indexing: false },
        active: []
      },
      isLoading: false,
      error: null
    });

    render(<MediaDatabaseCard />);

    expect(screen.getByText('create.search.gamesDbUpdate')).toBeInTheDocument();
  });

  it('should show checking status when loading', async () => {
    const { useQuery } = await import('@tanstack/react-query');
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });

    render(<MediaDatabaseCard />);

    expect(screen.getByText('settings.updateDb.status.checking')).toBeInTheDocument();
  });

  it('should show progress when indexing', () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 5,
      totalSteps: 10,
      currentStepDisplay: 'Scanning games directory'
    };

    const { container } = render(<MediaDatabaseCard />);

    expect(screen.getByText('Scanning games directory')).toBeInTheDocument();

    // Check for progress bar by finding the styled div
    const progressBars = container.querySelectorAll('[style*="width: 50.00%"]');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('should show preparing message when currentStepDisplay is empty', () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 10,
      currentStepDisplay: ''
    };

    render(<MediaDatabaseCard />);

    expect(screen.getByText('toast.preparingDb')).toBeInTheDocument();
  });

  it('should show writing message when on final step', () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 10,
      totalSteps: 10,
      currentStepDisplay: 'Finalizing'
    };

    render(<MediaDatabaseCard />);

    expect(screen.getByText('toast.writingDb')).toBeInTheDocument();
  });

  it('should hide progress bar when currentStep is 0', () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 10,
      currentStepDisplay: ''
    };

    const { container } = render(<MediaDatabaseCard />);

    const hiddenProgressBars = container.querySelectorAll('.hidden');
    expect(hiddenProgressBars.length).toBeGreaterThan(0);
  });

  it('should show pulsing animation when preparing or writing', () => {
    mockStore.gamesIndex = {
      indexing: true,
      exists: true,
      totalFiles: 100,
      currentStep: 0,
      totalSteps: 10,
      currentStepDisplay: ''
    };

    const { container } = render(<MediaDatabaseCard />);

    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });
});