import { ANTI_BOT_ACTION } from '@passflow/core';

/** The third-party human checks an app can choose instead of the built-in one. */
export type AntiBotVendor = 'turnstile' | 'hcaptcha' | 'recaptcha';

/** Resolves a fresh single-use token on every call. */
export type AntiBotGetToken = () => Promise<string>;

/** A rendered vendor widget, reduced to the two things the check needs from it. */
export type VendorWidget = { getToken: AntiBotGetToken; remove: () => void };

export type TurnstileRenderOptions = {
  sitekey: string;
  execution: 'execute';
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
};

export type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | null | undefined;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

export type HCaptchaRenderOptions = { sitekey: string; size: 'invisible' };

export type HCaptchaApi = {
  render: (container: HTMLElement, options: HCaptchaRenderOptions) => string;
  execute: (widgetId: string, options: { async: true }) => Promise<{ response: string }>;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

export type RecaptchaApi = {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => PromiseLike<string>;
};

/** The globals each vendor script defines once it has loaded. */
export type AntiBotVendorGlobals = {
  turnstile?: TurnstileApi;
  hcaptcha?: HCaptchaApi;
  grecaptcha?: RecaptchaApi;
};

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const HCAPTCHA_SCRIPT_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit';
export const recaptchaScriptSrc = (siteKey: string) =>
  `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;

const vendorGlobals = (): AntiBotVendorGlobals => window as unknown as AntiBotVendorGlobals;

const scripts = new Map<AntiBotVendor, Promise<void>>();

/**
 * Loads a vendor script once per page. A global that is already present (the
 * host page or a fake put it there) means no script is added. A failed load is
 * forgotten, so the next mount tries once more.
 */
export const loadVendorScript = (vendor: AntiBotVendor, src: string, isLoaded: () => boolean): Promise<void> => {
  if (isLoaded()) return Promise.resolve();
  const existing = scripts.get(vendor);
  if (existing) return existing;

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.passflowAntiBot = vendor;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scripts.delete(vendor);
      script.remove();
      reject(new Error(`The ${vendor} script did not load`));
    });
    document.head.appendChild(script);
  });
  scripts.set(vendor, loading);
  return loading;
};

const loaded = <T>(api: T | undefined, vendor: AntiBotVendor): T => {
  if (!api) throw new Error(`The ${vendor} script loaded without its API`);
  return api;
};

const mountTurnstile = async (siteKey: string, container: HTMLElement): Promise<VendorWidget> => {
  await loadVendorScript('turnstile', TURNSTILE_SCRIPT_SRC, () => Boolean(vendorGlobals().turnstile));
  const turnstile = loaded(vendorGlobals().turnstile, 'turnstile');

  let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined;
  let widgetId: string | undefined;
  const settle = () => {
    const current = pending;
    pending = undefined;
    if (widgetId) turnstile.reset(widgetId);
    return current;
  };
  const fail = () => settle()?.reject(new Error('The Turnstile check failed'));

  const rendered = turnstile.render(container, {
    sitekey: siteKey,
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token) => settle()?.resolve(token),
    'error-callback': fail,
    'timeout-callback': fail,
  });
  if (!rendered) throw new Error('Turnstile did not render');
  widgetId = rendered;

  return {
    getToken: () =>
      new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        turnstile.execute(rendered);
      }),
    remove: () => {
      pending = undefined;
      turnstile.remove(rendered);
    },
  };
};

const mountHCaptcha = async (siteKey: string, container: HTMLElement): Promise<VendorWidget> => {
  await loadVendorScript('hcaptcha', HCAPTCHA_SCRIPT_SRC, () => Boolean(vendorGlobals().hcaptcha));
  const hcaptcha = loaded(vendorGlobals().hcaptcha, 'hcaptcha');
  const widgetId = hcaptcha.render(container, { sitekey: siteKey, size: 'invisible' });

  return {
    getToken: async () => {
      try {
        const { response } = await hcaptcha.execute(widgetId, { async: true });
        return response;
      } finally {
        hcaptcha.reset(widgetId);
      }
    },
    remove: () => hcaptcha.remove(widgetId),
  };
};

const mountRecaptcha = async (siteKey: string): Promise<VendorWidget> => {
  await loadVendorScript('recaptcha', recaptchaScriptSrc(siteKey), () => Boolean(vendorGlobals().grecaptcha));
  const grecaptcha = loaded(vendorGlobals().grecaptcha, 'recaptcha');

  return {
    getToken: async () => {
      await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
      return await grecaptcha.execute(siteKey, { action: ANTI_BOT_ACTION });
    },
    // The v3 script and its badge stay for the life of the page.
    remove: () => undefined,
  };
};

/** Loads the vendor's script if needed and renders its widget into `container`. */
export const mountVendorWidget = (provider: AntiBotVendor, siteKey: string, container: HTMLElement): Promise<VendorWidget> => {
  switch (provider) {
    case 'turnstile':
      return mountTurnstile(siteKey, container);
    case 'hcaptcha':
      return mountHCaptcha(siteKey, container);
    case 'recaptcha':
      return mountRecaptcha(siteKey);
  }
};
