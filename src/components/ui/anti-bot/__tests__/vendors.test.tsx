import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const vendors = ['turnstile', 'hcaptcha', 'recaptcha'] as const;
type Vendor = (typeof vendors)[number];
type WidgetOptions = {
  callback?: (token: string) => void;
  'error-callback'?: () => void;
};

const siteKey = 'fake key/+';
const scriptUrl = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit',
  recaptcha: `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`,
};
const scripts = (vendor: Vendor) =>
  document.head.querySelectorAll<HTMLScriptElement>(`script[data-passflow-anti-bot="${vendor}"]`);

function installVendor(vendor: Vendor, fail = false) {
  const widgets = new Map<string, WidgetOptions>();
  let sequence = 0;
  const renderWidget = vi.fn((_container: Element, options: WidgetOptions) => {
    const id = `widget-${widgets.size + 1}`;
    widgets.set(id, options);
    return id;
  });
  const execute = vi.fn((keyOrId: string, _options?: object) => {
    const token = `token-${++sequence}`;
    if (vendor === 'turnstile') {
      queueMicrotask(() => {
        const widget = widgets.get(keyOrId);
        if (fail) widget?.['error-callback']?.();
        else widget?.callback?.(token);
      });
      return;
    }
    if (fail) return Promise.reject(new Error('Token refused'));
    return Promise.resolve(vendor === 'hcaptcha' ? { response: token } : token);
  });
  const ready = vi.fn((callback: () => void) => queueMicrotask(callback));
  const reset = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal(
    vendor === 'recaptcha' ? 'grecaptcha' : vendor,
    vendor === 'recaptcha' ? { execute, ready } : { render: renderWidget, execute, reset, remove },
  );
  return { renderWidget, execute, ready, reset, remove };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('script[data-passflow-anti-bot]').forEach((script) => {
    script.remove();
  });
});

async function freshCheck() {
  vi.resetModules();
  const { AntiBotCheck } = await import('@/components/ui');
  return AntiBotCheck;
}

describe('REQ-5 AntiBotCheck vendor protocol', () => {
  it.each(vendors)('shares the %s script across simultaneous mounts and a remount', async (provider) => {
    const AntiBotCheck = await freshCheck();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const first = render(<AntiBotCheck provider={provider} siteKey={siteKey} onReady={firstReady} />);
    const second = render(<AntiBotCheck provider={provider} siteKey={siteKey} onReady={secondReady} />);

    expect(scripts(provider)).toHaveLength(1);
    expect(scripts(provider)[0].getAttribute('src')).toBe(scriptUrl[provider]);
    expect(firstReady).not.toHaveBeenCalledWith(expect.any(Function));
    expect(secondReady).not.toHaveBeenCalledWith(expect.any(Function));

    installVendor(provider);
    await act(async () => scripts(provider)[0].dispatchEvent(new Event('load')));
    expect(firstReady).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(secondReady).toHaveBeenCalledExactlyOnceWith(expect.any(Function));

    first.unmount();
    second.unmount();
    const remountReady = vi.fn();
    render(<AntiBotCheck provider={provider} siteKey={siteKey} onReady={remountReady} />);
    await waitFor(() => expect(remountReady).toHaveBeenCalledWith(expect.any(Function)));
    expect(scripts(provider)).toHaveLength(1);
  });

  it.each(vendors)('returns a fresh %s token for each request and tears down the ready handle', async (provider) => {
    const AntiBotCheck = await freshCheck();
    const vendor = installVendor(provider);
    const onReady = vi.fn();
    const view = render(<AntiBotCheck provider={provider} siteKey={siteKey} onReady={onReady} />);
    const widget = view.container.querySelector(`[data-anti-bot-provider="${provider}"]`);
    expect(widget).not.toBeNull();
    await waitFor(() => expect(onReady).toHaveBeenCalledExactlyOnceWith(expect.any(Function)));
    expect(scripts(provider)).toHaveLength(0);

    const [[getToken]] = onReady.mock.calls;
    const readyBeforeRequests = vendor.ready.mock.calls.length;
    await expect(getToken()).resolves.toBe('token-1');
    await expect(getToken()).resolves.toBe('token-2');
    expect(vendor.execute).toHaveBeenCalledTimes(2);

    if (provider === 'recaptcha') {
      expect(vendor.ready.mock.calls.length - readyBeforeRequests).toBe(2);
      expect(vendor.execute.mock.calls).toEqual([
        [siteKey, { action: 'passflow_auth' }],
        [siteKey, { action: 'passflow_auth' }],
      ]);
    } else {
      const params =
        provider === 'turnstile'
          ? { sitekey: siteKey, execution: 'execute', appearance: 'interaction-only' }
          : { sitekey: siteKey, size: 'invisible' };
      expect(vendor.renderWidget).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLElement), expect.objectContaining(params));
      expect(widget?.contains(vendor.renderWidget.mock.calls[0][0])).toBe(true);
      const executeArgs = provider === 'turnstile' ? ['widget-1'] : ['widget-1', { async: true }];
      expect(vendor.execute.mock.calls).toEqual([executeArgs, executeArgs]);
      expect(vendor.reset.mock.calls).toEqual([['widget-1'], ['widget-1']]);
    }

    view.unmount();
    expect(onReady.mock.calls).toEqual([[getToken], [undefined]]);
    if (provider !== 'recaptcha') expect(vendor.remove).toHaveBeenCalledExactlyOnceWith('widget-1');
  });

  it.each(vendors)('rejects a token request refused by %s', async (provider) => {
    const AntiBotCheck = await freshCheck();
    installVendor(provider, true);
    const onReady = vi.fn();
    render(<AntiBotCheck provider={provider} siteKey={siteKey} onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.any(Function)));
    await expect(onReady.mock.calls[0][0]()).rejects.toBeDefined();
  });

  it('settles a waiting Turnstile request when a newer one replaces it or the widget goes away', async () => {
    const AntiBotCheck = await freshCheck();
    const vendor = installVendor('turnstile');
    // The check never answers on its own, so each request stays waiting.
    vendor.execute.mockImplementation(() => undefined);
    const onReady = vi.fn();
    const view = render(<AntiBotCheck provider='turnstile' siteKey={siteKey} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.any(Function)));
    const [[getToken]] = onReady.mock.calls;

    const replaced = getToken();
    const removed = getToken();
    await expect(replaced).rejects.toThrow('The Turnstile check was replaced');

    view.unmount();
    await expect(removed).rejects.toThrow('The Turnstile check was removed');
  });

  it('allows a fresh mount to load the script after a load error', async () => {
    const AntiBotCheck = await freshCheck();
    const onReady = vi.fn();
    const props = { provider: 'turnstile', siteKey, onReady } as const;
    const first = render(<AntiBotCheck {...props} />);
    const failed = scripts('turnstile')[0];
    expect(failed).toBeDefined();
    await act(async () => failed.dispatchEvent(new Event('error')));
    expect(onReady).not.toHaveBeenCalledWith(expect.any(Function));
    first.unmount();

    render(<AntiBotCheck {...props} />);
    expect(scripts('turnstile')).toHaveLength(1);
    expect(scripts('turnstile')[0]).not.toBe(failed);
    installVendor('turnstile');
    await act(async () => scripts('turnstile')[0].dispatchEvent(new Event('load')));
    expect(onReady).toHaveBeenCalledWith(expect.any(Function));
  });
});
