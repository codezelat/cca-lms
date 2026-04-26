type TurnstileWidgetId = string;

interface TurnstileRenderOptions {
  sitekey?: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
}

interface Turnstile {
  render(container: HTMLElement, options: TurnstileRenderOptions): TurnstileWidgetId;
  reset(widgetId?: TurnstileWidgetId): void;
  remove(widgetId: TurnstileWidgetId): void;
}

interface Window {
  turnstile?: Turnstile;
}
