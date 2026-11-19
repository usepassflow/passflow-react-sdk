import type { TwoFactorConfirmResponse, TwoFactorSetupResponse } from '@passflow/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { enrollmentFailureFrom, twoFactorRateLimitedMessage, twoFactorWrongCodeMessage } from '@/utils/auth-error';
import { useHydrated } from './use-hydrated';
import { usePassflow } from './use-passflow';

/** `checking` reads whether a signed-in user is enrolled; `enrolled` is a user with two-factor authentication on. */
export type TwoFactorSetupStep = 'checking' | 'idle' | 'setup' | 'complete' | 'enrolled';

export type UseTwoFactorSetupProps = () => {
  setupData: TwoFactorSetupResponse | null;
  recoveryCodes: string[];
  step: TwoFactorSetupStep;
  beginSetup: () => Promise<TwoFactorSetupResponse | null>;
  confirmSetup: (code: string) => Promise<TwoFactorConfirmResponse | null>;
  reset: () => void;
  /** The user saved the codes, or there were none: the step becomes `enrolled`. */
  finish: () => void;
  isLoading: boolean;
  isError: boolean;
  error: string;
};

/** A rate limit on the link page's confirm is a 400 with an id, so the status alone cannot tell. */
const setupErrorMessage = (e: unknown): string => {
  const failure = enrollmentFailureFrom(e);
  if (failure === 'rate_limited') return twoFactorRateLimitedMessage;
  if (failure === 'wrong_code') return twoFactorWrongCodeMessage;
  return (e as Error).message;
};

/**
 * Hook to handle 2FA setup flow (enable 2FA)
 */
export const useTwoFactorSetup: UseTwoFactorSetupProps = () => {
  const passflow = usePassflow();
  const hydrated = useHydrated();
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // Signed out, as in a setup link or a sign-in waiting on its second factor, there is no status to read.
  const [step, setStep] = useState<TwoFactorSetupStep>(() => (passflow.isAuthenticated() ? 'checking' : 'idle'));

  const checkedRef = useRef(false);
  useEffect(() => {
    if (step !== 'checking' || checkedRef.current) return;
    checkedRef.current = true;
    const read = async () => {
      let enabled = false;
      try {
        enabled = (await passflow.getTwoFactorStatus()).enabled;
      } catch {
        // Unread, the user can still start: the server refuses a second enrolment.
      }
      setStep((current) => (current === 'checking' ? (enabled ? 'enrolled' : 'idle') : current));
    };
    void read();
  }, [passflow, step]);

  const beginSetup = useCallback(async (): Promise<TwoFactorSetupResponse | null> => {
    setIsLoading(true);
    setIsError(false);
    setError('');
    try {
      const response = await passflow.beginTwoFactorSetup();
      setSetupData(response);
      setStep('setup');
      return response;
    } catch (e) {
      setIsError(true);
      setError(setupErrorMessage(e));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [passflow]);

  const confirmSetup = useCallback(
    async (code: string): Promise<TwoFactorConfirmResponse | null> => {
      setIsLoading(true);
      setIsError(false);
      setError('');
      try {
        const response = await passflow.confirmTwoFactorSetup(code);
        // The answer may carry no codes: an empty list, null or no field.
        setRecoveryCodes(response.recovery_codes ?? []);
        setStep('complete');
        return response;
      } catch (e) {
        setIsError(true);
        setError(setupErrorMessage(e));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [passflow],
  );

  const reset = useCallback(() => {
    setSetupData(null);
    setRecoveryCodes([]);
    setIsError(false);
    setError('');
    setStep('idle');
  }, []);

  const finish = useCallback(() => setStep('enrolled'), []);

  return {
    setupData,
    recoveryCodes,
    // Hydration renders what the signed-out server rendered.
    step: hydrated ? step : 'idle',
    beginSetup,
    confirmSetup,
    reset,
    finish,
    isLoading,
    isError,
    error,
  };
};
