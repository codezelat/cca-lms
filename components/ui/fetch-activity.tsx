"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface FetchActivityContextValue {
  isVisible: boolean;
  pendingCount: number;
}

const FetchActivityContext = createContext<FetchActivityContextValue | null>(
  null,
);

const GLOBAL_LOADING_HEADER = "x-global-loading";
const IGNORED_PATHS = new Set(["/api/audit/visit"]);

const getHeaderValue = (
  headers: HeadersInit | undefined,
  name: string,
): string | null => {
  if (!headers) return null;

  const normalizedName = name.toLowerCase();

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (Array.isArray(headers)) {
    const header = headers.find(([key]) => key.toLowerCase() === normalizedName);
    return header?.[1] ?? null;
  }

  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === normalizedName,
  );
  const value = key
    ? (headers as Record<string, string | undefined>)[key]
    : undefined;

  return typeof value === "string" ? value : null;
};

const resolveRequestUrl = (input: RequestInfo | URL): URL | null => {
  try {
    if (typeof input === "string" || input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }

    if (input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }
  } catch {
    return null;
  }

  return null;
};

const shouldTrackRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean => {
  const url = resolveRequestUrl(input);
  if (!url || url.origin !== window.location.origin) {
    return false;
  }

  if (!url.pathname.startsWith("/api/") || IGNORED_PATHS.has(url.pathname)) {
    return false;
  }

  const override =
    getHeaderValue(init?.headers, GLOBAL_LOADING_HEADER) ||
    (input instanceof Request
      ? input.headers.get(GLOBAL_LOADING_HEADER)
      : null);

  return override?.toLowerCase() !== "ignore";
};

export function FetchActivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const showTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!shouldTrackRequest(input, init)) {
        return originalFetch(input, init);
      }

      setPendingCount((count) => count + 1);

      try {
        return await originalFetch(input, init);
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (pendingCount > 0) {
      if (showTimerRef.current === null) {
        showTimerRef.current = window.setTimeout(() => {
          setIsVisible(true);
          showTimerRef.current = null;
        }, 180);
      }

      return;
    }

    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    setIsVisible(false);
  }, [pendingCount]);

  const value = useMemo(
    () => ({
      isVisible,
      pendingCount,
    }),
    [isVisible, pendingCount],
  );

  return (
    <FetchActivityContext.Provider value={value}>
      {children}
    </FetchActivityContext.Provider>
  );
}

export function useFetchActivity() {
  const context = useContext(FetchActivityContext);

  if (!context) {
    throw new Error(
      "useFetchActivity must be used within a FetchActivityProvider",
    );
  }

  return context;
}
