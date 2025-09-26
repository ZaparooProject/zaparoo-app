import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { PageFrame } from '@/components/PageFrame';
import { useRef } from 'react';

// Mock BackIcon
vi.mock('@/lib/images', () => ({
  BackIcon: ({ size }: { size: string }) => (
    <div data-testid="back-icon" data-size={size}>←</div>
  )
}));

// Mock ResponsiveContainer
vi.mock('@/components/ResponsiveContainer', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  )
}));

// Test component for ref testing
const TestComponentWithRef = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PageFrame scrollRef={scrollRef}>
      <div>Content with ref</div>
    </PageFrame>
  );
};

describe('PageFrame', () => {
  it('should render children without header', () => {
    render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(1);
  });

  it('should render with custom header', () => {
    const customHeader = <div data-testid="custom-header">Custom Header</div>;

    render(
      <PageFrame header={customHeader}>
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    expect(screen.getByText('Custom Header')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(2);
  });

  it('should render with headerLeft, headerCenter, and headerRight', () => {
    const headerLeft = <div data-testid="header-left">Left</div>;
    const headerCenter = <div data-testid="header-center">Center</div>;
    const headerRight = <div data-testid="header-right">Right</div>;

    render(
      <PageFrame
        headerLeft={headerLeft}
        headerCenter={headerCenter}
        headerRight={headerRight}
      >
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByTestId('header-left')).toBeInTheDocument();
    expect(screen.getByTestId('header-center')).toBeInTheDocument();
    expect(screen.getByTestId('header-right')).toBeInTheDocument();
    expect(screen.getByText('Left')).toBeInTheDocument();
    expect(screen.getByText('Center')).toBeInTheDocument();
    expect(screen.getByText('Right')).toBeInTheDocument();
  });

  it('should support deprecated title prop', () => {
    render(
      <PageFrame title="Test Title">
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('should support deprecated back prop', () => {
    const mockBack = vi.fn();

    render(
      <PageFrame back={mockBack}>
        <div>Test content</div>
      </PageFrame>
    );

    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();
    expect(screen.getByTestId('back-icon')).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('should combine deprecated title and back props', () => {
    const mockBack = vi.fn();

    render(
      <PageFrame title="Test Title" back={mockBack}>
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    const backButton = screen.getByRole('button');
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('should prioritize new props over deprecated ones', () => {
    const mockBack = vi.fn();
    const headerLeft = <div data-testid="new-header-left">New Left</div>;
    const headerCenter = <div data-testid="new-header-center">New Center</div>;

    render(
      <PageFrame
        title="Deprecated Title"
        back={mockBack}
        headerLeft={headerLeft}
        headerCenter={headerCenter}
      >
        <div>Test content</div>
      </PageFrame>
    );

    // Should use new props, not deprecated ones
    expect(screen.getByTestId('new-header-left')).toBeInTheDocument();
    expect(screen.getByTestId('new-header-center')).toBeInTheDocument();
    expect(screen.getByText('New Left')).toBeInTheDocument();
    expect(screen.getByText('New Center')).toBeInTheDocument();

    // Should not render deprecated title or back button
    expect(screen.queryByText('Deprecated Title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('back-icon')).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <PageFrame className="custom-class">
        <div>Test content</div>
      </PageFrame>
    );

    const pageFrame = container.firstChild as HTMLElement;
    expect(pageFrame).toHaveClass('custom-class');
    expect(pageFrame).toHaveClass('flex', 'h-full', 'w-full', 'flex-col');
  });

  it('should pass through additional props', () => {
    render(
      <PageFrame data-testid="page-frame" role="main">
        <div>Test content</div>
      </PageFrame>
    );

    const pageFrame = screen.getByTestId('page-frame');
    expect(pageFrame).toHaveAttribute('role', 'main');
  });

  it('should handle scrollRef', () => {
    render(<TestComponentWithRef />);

    expect(screen.getByText('Content with ref')).toBeInTheDocument();
    // The ref should be applied to the scrollable container
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(1);
  });

  it('should render only headerLeft', () => {
    const headerLeft = <div data-testid="only-left">Only Left</div>;

    render(
      <PageFrame headerLeft={headerLeft}>
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByTestId('only-left')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(2);
  });

  it('should render only headerRight', () => {
    const headerRight = <div data-testid="only-right">Only Right</div>;

    render(
      <PageFrame headerRight={headerRight}>
        <div>Test content</div>
      </PageFrame>
    );

    expect(screen.getByTestId('only-right')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(2);
  });

  it('should render with no header content when no header props are provided', () => {
    render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>
    );

    // Should only have one ResponsiveContainer (for content, not header)
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(1);
  });

  it('should apply correct classes when header is present', () => {
    const { container } = render(
      <PageFrame title="Test Title">
        <div>Test content</div>
      </PageFrame>
    );

    const scrollContainer = container.querySelector('.flex-1.overflow-y-auto');
    expect(scrollContainer).toHaveClass('px-4', 'pb-4');
  });

  it('should apply correct classes when header is not present', () => {
    const { container } = render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>
    );

    const scrollContainer = container.querySelector('.flex-1.overflow-y-auto');
    expect(scrollContainer).toHaveClass('p-4');
  });

  it('should render BackIcon with correct size', () => {
    const mockBack = vi.fn();

    render(
      <PageFrame back={mockBack}>
        <div>Test content</div>
      </PageFrame>
    );

    const backIcon = screen.getByTestId('back-icon');
    expect(backIcon).toHaveAttribute('data-size', '24');
  });

  it('should handle empty header components gracefully', () => {
    render(
      <PageFrame
        headerLeft={null}
        headerCenter={null}
        headerRight={null}
      >
        <div>Test content</div>
      </PageFrame>
    );

    // When all header props are null, should not render header (no header content)
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(1);
  });
});