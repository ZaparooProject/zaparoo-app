import { render } from '../../../../test-utils';
import { vi } from 'vitest';
import { Route } from '@/routes/__root';

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    removeAllListeners: vi.fn(),
    exitApp: vi.fn()
  }
}));

vi.mock('@tanstack/react-router', () => ({
  createRootRoute: vi.fn((config) => config),
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useNavigate: () => vi.fn()
}));

vi.mock('@/lib/safeArea', () => ({
  SafeAreaHandler: () => <div data-testid="safe-area-handler">SafeAreaHandler</div>
}));

vi.mock('@/components/ErrorComponent.tsx', () => ({
  ErrorComponent: () => <div data-testid="error-component">ErrorComponent</div>
}));

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav">BottomNav</div>
}));

describe('Root Route Navigation', () => {
  it('should render navigation layout components', () => {
    const Component = Route.component as React.ComponentType;
    const { getByTestId } = render(<Component />);
    
    expect(getByTestId('safe-area-handler')).toBeInTheDocument();
    expect(getByTestId('outlet')).toBeInTheDocument();
    expect(getByTestId('bottom-nav')).toBeInTheDocument();
  });
});