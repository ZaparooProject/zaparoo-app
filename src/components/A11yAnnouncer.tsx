import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";

interface AnnouncerContextType {
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

const AnnouncerContext = createContext<AnnouncerContextType | null>(null);

/**
 * Hook to access the announcer context for screen reader announcements.
 *
 * @example
 * const { announce } = useAnnouncer();
 * announce("Scan successful");
 * announce("Error occurred", "assertive"); // High priority
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with its Provider by design
export function useAnnouncer() {
  const context = useContext(AnnouncerContext);
  if (!context) {
    throw new Error("useAnnouncer must be used within A11yAnnouncerProvider");
  }
  return context;
}

interface A11yAnnouncerProviderProps {
  children: ReactNode;
}

/**
 * Provider component that enables screen reader announcements throughout the app.
 *
 * On native platforms, uses Capacitor's ScreenReader plugin.
 * On web, uses aria-live regions for announcements.
 *
 * Add this near the root of your app:
 * @example
 * <A11yAnnouncerProvider>
 *   <App />
 * </A11yAnnouncerProvider>
 */
export function A11yAnnouncerProvider({
  children,
}: A11yAnnouncerProviderProps) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = useCallback(
    (message: string, priority: "polite" | "assertive" = "polite") => {
      // Always use aria-live regions for consistent voice with TalkBack/VoiceOver
      // ScreenReader.speak() uses system TTS which has a different voice
      if (priority === "assertive") {
        // Clear first to trigger re-announcement of same message
        setAssertiveMessage("");
        requestAnimationFrame(() => {
          setAssertiveMessage(message);
        });
      } else {
        setPoliteMessage("");
        requestAnimationFrame(() => {
          setPoliteMessage(message);
        });
      }
    },
    [],
  );

  // Clear messages after they've been announced
  useEffect(() => {
    if (politeMessage) {
      const timer = setTimeout(() => setPoliteMessage(""), 1000);
      return () => clearTimeout(timer);
    }
  }, [politeMessage]);

  useEffect(() => {
    if (assertiveMessage) {
      const timer = setTimeout(() => setAssertiveMessage(""), 1000);
      return () => clearTimeout(timer);
    }
  }, [assertiveMessage]);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}

      {/* Screen reader announcement regions - visually hidden */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        role="alert"
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
}
