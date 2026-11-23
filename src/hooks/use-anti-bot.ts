import { type AppSettings, PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AntiBotCheckProps, AntiBotGetToken, AntiBotVendor } from '@/components/ui/anti-bot';
import { usePassflow } from './use-passflow';

/** The props for `AntiBotCheck`, or `undefined` when the app asks for no human check (or its settings are not loaded). */
export type UseAntiBotResult = AntiBotCheckProps | undefined;

// core sends no `AntiBotSolved` when a solve throws; the failed request's `Error` ends the status instead.
const SOLVING_EVENTS = [PassflowEvent.AntiBotSolving, PassflowEvent.AntiBotSolved, PassflowEvent.Error];

const notReady = () => Promise.reject(new Error('The anti-bot check is not ready'));

/**
 * The human check a `human_only` app asks for, as props for `AntiBotCheck`.
 *
 * - Built-in check: follows core's solving events, so the element can show its status.
 * - Turnstile, hCaptcha or reCAPTCHA: sets core's token provider while mounted, answering with the token of the widget
 *   the element reports through `onReady`, and clears it on unmount.
 * - `bot_friendly` (or no `bot_mode`) and settings not loaded yet: does nothing and returns `undefined`.
 *
 * Takes the settings the form already holds, so it adds no settings read of its own.
 */
export const useAntiBot = (appSettings: AppSettings | null | undefined): UseAntiBotResult => {
  const passflow = usePassflow();
  const humanOnly = Boolean(appSettings) && (appSettings?.bot_mode ?? 'bot_friendly') === 'human_only';
  const provider = appSettings?.anti_bot?.provider ?? 'builtin';
  const siteKey = appSettings?.anti_bot?.site_key;
  const builtin = humanOnly && provider === 'builtin';
  // A vendor without a site key renders nothing: core's provider-missing error then surfaces on submit.
  const vendor: AntiBotVendor | undefined = humanOnly && provider !== 'builtin' && siteKey ? provider : undefined;

  const [solving, setSolving] = useState(false);
  const getTokenRef = useRef<AntiBotGetToken | undefined>(undefined);
  const onReady = useCallback((getToken: AntiBotGetToken | undefined) => {
    getTokenRef.current = getToken;
  }, []);

  useEffect(() => {
    if (!builtin) return;
    const subscriber: PassflowSubscriber = {
      onAuthChange: (event) => setSolving(event === PassflowEvent.AntiBotSolving),
    };
    passflow.subscribe(subscriber, SOLVING_EVENTS);
    return () => {
      passflow.unsubscribe(subscriber, SOLVING_EVENTS);
      setSolving(false);
    };
  }, [passflow, builtin]);

  useEffect(() => {
    if (!vendor) return;
    passflow.setAntiBotTokenProvider(() => (getTokenRef.current ? getTokenRef.current() : notReady()));
    return () => passflow.setAntiBotTokenProvider(undefined);
  }, [passflow, vendor, siteKey]);

  return useMemo<UseAntiBotResult>(() => {
    if (builtin) return { provider: 'builtin', solving };
    if (vendor && siteKey) return { provider: vendor, siteKey, onReady };
    return undefined;
  }, [builtin, solving, vendor, siteKey, onReady]);
};
