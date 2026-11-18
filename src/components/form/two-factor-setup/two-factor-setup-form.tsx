import { type FC, useEffect, useRef } from 'react';
import { LoginScreen, type LoginScreenAction } from '@/components/ui';
import { useTwoFactorSetup } from '@/hooks';
import { twoFactorBackToSignInLabel } from '@/utils';
import {
  getTwoFactorRecoveryCodesScreen,
  getTwoFactorSetupCodeScreen,
  getTwoFactorSetupEnrolledScreen,
  getTwoFactorSetupStartScreen,
} from './setup-screen';

import '@/styles/index.css';

type TwoFactorSetupFormProps = {
  onComplete?: (recoveryCodes: string[]) => void;
  /** The way out of the first step only. */
  onCancel?: () => void;
  /** The way out of the first step and the code step, labelled Back to sign in. */
  onBackToSignIn?: () => void;
  numInputs?: number;
};

export const TwoFactorSetupForm: FC<TwoFactorSetupFormProps> = ({ onComplete, onCancel, onBackToSignIn, numInputs }) => {
  const { setupData, recoveryCodes, step, beginSetup, confirmSetup, finish, isLoading, isError, error } = useTwoFactorSetup();
  const shownError = isError ? error : null;
  const backToSignIn: LoginScreenAction | undefined = onBackToSignIn
    ? { label: twoFactorBackToSignInLabel, onClick: onBackToSignIn }
    : undefined;
  const cancel: LoginScreenAction | undefined = onCancel ? { label: 'Cancel', onClick: onCancel } : undefined;

  const handleComplete = () => {
    // A caller that gets `onComplete` owns the next step: its session may be gone, so the form stays on the codes.
    if (onComplete) onComplete(recoveryCodes);
    else finish();
  };

  // No codes to save: the codes screen is skipped.
  const skipsCodes = step === 'complete' && recoveryCodes.length === 0;
  const skipCodesRef = useRef(handleComplete);
  skipCodesRef.current = handleComplete;
  useEffect(() => {
    if (skipsCodes) skipCodesRef.current();
  }, [skipsCodes]);

  if (step === 'enrolled' || skipsCodes) return <LoginScreen {...getTwoFactorSetupEnrolledScreen()} />;

  if (step === 'idle' || step === 'checking') {
    return (
      <LoginScreen
        {...getTwoFactorSetupStartScreen({
          busy: isLoading || step === 'checking',
          error: shownError,
          secondaryAction: backToSignIn ?? cancel,
          onStart: () => void beginSetup(),
        })}
      />
    );
  }

  if (step === 'setup' && setupData) {
    return (
      <LoginScreen
        {...getTwoFactorSetupCodeScreen({
          data: setupData,
          fallbackDigits: numInputs,
          busy: isLoading,
          error: shownError,
          secondaryAction: backToSignIn,
          onSubmit: (code) => void confirmSetup(code),
        })}
      />
    );
  }

  if (step === 'complete') {
    return (
      <LoginScreen {...getTwoFactorRecoveryCodesScreen({ codes: recoveryCodes, busy: false, onContinue: handleComplete })} />
    );
  }

  return null;
};
