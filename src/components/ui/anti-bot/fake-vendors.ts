/*
 * Stand-ins for the Turnstile, hCaptcha and reCAPTCHA v3 globals, for stories
 * and tests. With them installed the loader finds each global already present
 * and adds no script, so nothing reaches a vendor host. Not exported from the
 * package.
 */
import type {
  AntiBotVendorGlobals,
  HCaptchaApi,
  HCaptchaRenderOptions,
  RecaptchaApi,
  TurnstileApi,
  TurnstileRenderOptions,
} from './vendors';

export type FakeAntiBotOptions = {
  /** `render` returns no widget id (Turnstile) or throws (hCaptcha), so the check never becomes ready. */
  failRender?: boolean;
  /** Every token request is refused by the vendor. */
  failExecute?: boolean;
};

export type FakeWidgetCounts = { render: number; execute: number; reset: number; remove: number };

export type FakeAntiBotRecord = {
  turnstile: FakeWidgetCounts & { options: TurnstileRenderOptions[] };
  hcaptcha: FakeWidgetCounts & { options: HCaptchaRenderOptions[] };
  recaptcha: { ready: number; execute: number; siteKeys: string[]; actions: string[] };
};

type FakeWindow = AntiBotVendorGlobals & { __passflowFakeAntiBot?: FakeAntiBotRecord };

const fakeWindow = (): FakeWindow => window as unknown as FakeWindow;

export const FAKE_WIDGET_CLASS = 'passflow-anti-bot-fake-widget';

const drawFakeWidget = (container: HTMLElement, id: string, label: string) => {
  const marker = document.createElement('span');
  marker.className = FAKE_WIDGET_CLASS;
  marker.dataset.fakeWidgetId = id;
  marker.textContent = label;
  container.appendChild(marker);
};

const eraseFakeWidget = (id: string) => {
  document.querySelector(`[data-fake-widget-id="${id}"]`)?.remove();
};

const emptyCounts = (): FakeWidgetCounts => ({ render: 0, execute: 0, reset: 0, remove: 0 });

/** Installs the three fake globals and returns the record they count into (also on `window.__passflowFakeAntiBot`). */
export const installFakeAntiBotVendors = (options: FakeAntiBotOptions = {}): FakeAntiBotRecord => {
  const record: FakeAntiBotRecord = {
    turnstile: { ...emptyCounts(), options: [] },
    hcaptcha: { ...emptyCounts(), options: [] },
    recaptcha: { ready: 0, execute: 0, siteKeys: [], actions: [] },
  };

  const turnstileWidgets = new Map<string, TurnstileRenderOptions>();
  const turnstile: TurnstileApi = {
    render: (container, renderOptions) => {
      record.turnstile.render += 1;
      record.turnstile.options.push(renderOptions);
      if (options.failRender) return undefined;
      const id = `turnstile-widget-${record.turnstile.render}`;
      turnstileWidgets.set(id, renderOptions);
      drawFakeWidget(container, id, 'Turnstile (fake)');
      return id;
    },
    execute: (id) => {
      record.turnstile.execute += 1;
      const token = `turnstile-token-${record.turnstile.execute}`;
      const widget = turnstileWidgets.get(id);
      setTimeout(() => {
        if (options.failExecute) widget?.['error-callback']();
        else widget?.callback(token);
      }, 0);
    },
    reset: () => {
      record.turnstile.reset += 1;
    },
    remove: (id) => {
      record.turnstile.remove += 1;
      turnstileWidgets.delete(id);
      eraseFakeWidget(id);
    },
  };

  const hcaptcha: HCaptchaApi = {
    render: (container, renderOptions) => {
      record.hcaptcha.render += 1;
      record.hcaptcha.options.push(renderOptions);
      if (options.failRender) throw new Error('The fake hCaptcha refused to render');
      const id = `hcaptcha-widget-${record.hcaptcha.render}`;
      drawFakeWidget(container, id, 'hCaptcha (fake)');
      return id;
    },
    execute: async () => {
      record.hcaptcha.execute += 1;
      if (options.failExecute) throw new Error('challenge-closed');
      return { response: `hcaptcha-token-${record.hcaptcha.execute}` };
    },
    reset: () => {
      record.hcaptcha.reset += 1;
    },
    remove: (id) => {
      record.hcaptcha.remove += 1;
      eraseFakeWidget(id);
    },
  };

  const grecaptcha: RecaptchaApi = {
    ready: (callback) => {
      record.recaptcha.ready += 1;
      setTimeout(callback, 0);
    },
    execute: async (siteKey, { action }) => {
      record.recaptcha.execute += 1;
      record.recaptcha.siteKeys.push(siteKey);
      record.recaptcha.actions.push(action);
      if (options.failExecute) throw new Error('The fake reCAPTCHA refused');
      return `recaptcha-token-${record.recaptcha.execute}`;
    },
  };

  const target = fakeWindow();
  target.turnstile = turnstile;
  target.hcaptcha = hcaptcha;
  target.grecaptcha = grecaptcha;
  target.__passflowFakeAntiBot = record;
  return record;
};

/** Removes the fake globals again. */
export const uninstallFakeAntiBotVendors = () => {
  const target = fakeWindow();
  delete target.turnstile;
  delete target.hcaptcha;
  delete target.grecaptcha;
  delete target.__passflowFakeAntiBot;
};
