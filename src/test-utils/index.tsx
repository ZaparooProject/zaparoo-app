import React from "react";
import {
  render,
  RenderOptions,
  renderHook,
  RenderHookOptions,
  RenderHookResult,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SlideModalProvider } from "../components/SlideModalProvider";
import { A11yAnnouncerProvider } from "../components/A11yAnnouncer";

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Provider wrapper component
function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <A11yAnnouncerProvider>
        <SlideModalProvider>{children}</SlideModalProvider>
      </A11yAnnouncerProvider>
    </QueryClientProvider>
  );
}

// Custom render function that wraps components with necessary providers
function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Custom renderHook function that wraps hooks with necessary providers
function customRenderHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
): RenderHookResult<Result, Props> {
  return renderHook(hook, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing library
export * from "@testing-library/react";
export { customRender as render, customRenderHook as renderHook };
