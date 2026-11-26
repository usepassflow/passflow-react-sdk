import { phone } from 'phone';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { DefaultMethod } from '@/types';
import { cn, emailRegex, passwordValidation } from '@/utils';
import { Button } from '../button';
import { FieldPassword } from '../fields/field-password';
import { FieldPhone } from '../fields/field-phone';
import { FieldText } from '../fields/field-text';
import { Icon } from '../icon';
import { Link } from '../link';
import { ProvidersBox } from '../providers-box';
import { Switch } from '../switch';
import { VisuallyHidden } from '../visually-hidden';
import { LoginActionStack, LoginAlert, LoginDivider, LoginScreenNotice } from './shared';
import type { LoginCredentialsState, LoginCredentialsValues } from './types';

type CredentialsAction = 'password' | 'passwordless' | 'passkey';

type LoginFormValues = {
  email_or_username: string;
  phone: string;
  password: string;
};

const initialValues: LoginFormValues = {
  email_or_username: '',
  phone: '',
  password: '',
};

const getDefaultMethod = (state: LoginCredentialsState): DefaultMethod | null => {
  if (state.initialMethod !== undefined && state.methods.identities.some((method) => method.id === state.initialMethod)) {
    return state.initialMethod;
  }
  return state.methods.identities[0]?.id ?? null;
};

export const LoginCredentials: FC<LoginCredentialsState> = (state) => {
  const { methods } = state;
  const computedDefaultMethod = getDefaultMethod(state);
  const [defaultMethod, setDefaultMethod] = useState<DefaultMethod | null>(computedDefaultMethod);
  const [passkeyOnly, setPasskeyOnly] = useState(Boolean(state.forcePasskey));
  const [pressedAction, setPressedAction] = useState<CredentialsAction | null>(null);
  const previousComputedMethod = useRef(computedDefaultMethod);
  const previousForcePasskey = useRef(Boolean(state.forcePasskey));
  const {
    control,
    getValues,
    reset,
    trigger,
    watch,
    formState: { errors, isDirty, isValid, isSubmitted, touchedFields },
    handleSubmit,
  } = useForm<LoginFormValues>({
    defaultValues: initialValues,
    mode: 'onChange',
  });

  useEffect(() => {
    if (previousComputedMethod.current === computedDefaultMethod) return;
    previousComputedMethod.current = computedDefaultMethod;
    setDefaultMethod(computedDefaultMethod);
    reset(initialValues);
  }, [computedDefaultMethod, reset]);

  // A press only names the request it starts. Once that request ends, a later one this form did not start (an agent
  // tool) shows the spinner on the first action.
  useEffect(() => {
    if (!state.busy) setPressedAction(null);
  }, [state.busy]);

  useEffect(() => {
    const nextForcePasskey = Boolean(state.forcePasskey);
    if (previousForcePasskey.current === nextForcePasskey) return;
    previousForcePasskey.current = nextForcePasskey;
    setPasskeyOnly(nextForcePasskey);
  }, [state.forcePasskey]);

  const currentIdentity = methods.identities.find((method) => method.id === defaultMethod);
  const hasPassword = Boolean(currentIdentity?.password);
  const hasPasswordless = Boolean(currentIdentity?.passwordlessLabel);
  const hasPasskey = methods.passkey;
  const hasIdentity = Boolean(currentIdentity);
  const showCredentialFields = !passkeyOnly && hasIdentity;
  const showStandalonePasskey = hasPasskey && (passkeyOnly || !hasIdentity);
  const hasCredentialActions = hasPassword || hasPasswordless || hasPasskey;
  const controlsDisabled = Boolean(state.busy || state.disabled);
  // While busy, the button that started the request shows the spinner. A request started without a press here (an
  // agent tool, or a screen that opened busy) shows it on the form's first action.
  const primaryAction: CredentialsAction =
    showCredentialFields && hasPassword ? 'password' : showCredentialFields && hasPasswordless ? 'passwordless' : 'passkey';
  const loadingAction = state.busy ? (pressedAction ?? primaryAction) : null;
  const passkeyLoading = loadingAction === 'passkey';
  const errorScope = state.error?.scope;
  const hasIdentityError = errorScope === 'identity' || errorScope === 'credentials';
  const hasPasswordError = errorScope === 'password' || errorScope === 'credentials';
  const isNewPassword = state.credentialPurpose === 'sign-up';
  // The identity is checked on every keystroke so the submit button can enable, but a half-typed address is not an
  // error yet: its message waits until the user leaves the field or submits.
  const identityError = touchedFields.email_or_username || isSubmitted ? errors.email_or_username : undefined;

  const validatePassword = (value: string) => {
    if (!isNewPassword) return true;

    try {
      passwordValidation(state.passwordPolicy).validateSync(value);
      return true;
    } catch (error) {
      const validationError = error as { errors?: string[] };
      return validationError.errors?.join(', ') ?? 'Password does not meet the requirements';
    }
  };

  const toCredentials = (values: LoginFormValues): LoginCredentialsValues => ({
    method: defaultMethod,
    emailOrUsername: values.email_or_username,
    phone: values.phone,
    password: values.password,
  });

  const handleReset = () => {
    reset(initialValues);
    state.onReset?.();
  };

  const handleMethodChange = (method: DefaultMethod) => {
    setDefaultMethod(method);
    handleReset();
  };

  const handlePasskeyExperienceChange = (checked: boolean) => {
    setPasskeyOnly(checked);
    handleReset();
  };

  const submitCurrentMethod = handleSubmit((values) => {
    if (hasPassword) {
      setPressedAction('password');
      state.onPassword?.(toCredentials(values));
      return;
    }
    if (hasPasswordless) {
      setPressedAction('passwordless');
      state.onPasswordless?.(toCredentials(values));
    }
  });

  const submitPasswordless = async () => {
    if (!defaultMethod || !state.onPasswordless) return;
    const identityField = defaultMethod === 'phone' ? 'phone' : 'email_or_username';
    if (!(await trigger(identityField))) return;
    setPressedAction('passwordless');
    state.onPasswordless(toCredentials(getValues()));
  };
  const startPasskey = () => {
    setPressedAction('passkey');
    state.onPasskey?.();
  };
  const passkeyAction = state.onPasskey ? (
    <>
      <Button
        size='big'
        variant='dark'
        type='button'
        className='passflow-button-passkey'
        withIcon
        loading={passkeyLoading}
        disabled={controlsDisabled && !passkeyLoading}
        onClick={startPasskey}
      >
        {passkeyLoading ? null : (
          <Icon id='key' size='small' type='general' className='passflow-button-passkey-icon' decorative matchTextColor />
        )}
        {state.passkeyLabel ?? 'Sign In with a Passkey'}
      </Button>
      {passkeyLoading && state.onCancel ? (
        <Button size='small' variant='link' type='button' onClick={state.onCancel}>
          Cancel
        </Button>
      ) : null}
    </>
  ) : null;
  const selectedIdentityValue = defaultMethod === 'phone' ? watch('phone') : watch('email_or_username');
  const alternateIdentity = methods.identities.find((method) => method.id !== defaultMethod);
  const formAlert =
    state.error?.startAgain && state.onStartAgain ? (
      <div className='passflow-login-screen-alert-row'>
        <LoginAlert message={state.error.message} />
        <Button size='small' variant='link' type='button' disabled={controlsDisabled} onClick={state.onStartAgain}>
          Start again
        </Button>
      </div>
    ) : (
      <LoginAlert message={state.error?.message} />
    );

  return (
    <>
      {state.notice ? <LoginScreenNotice {...state.notice} /> : null}
      {state.allowPasskeyToggle && hasPasskey && hasIdentity && (hasPassword || hasPasswordless) ? (
        <div className='passflow-form-switch'>
          <Switch
            label='Passwordless experience'
            checked={passkeyOnly}
            disabled={controlsDisabled}
            onChange={(event) => handlePasskeyExperienceChange(event.target.checked)}
          />
        </div>
      ) : null}
      <form
        className='passflow-form'
        data-testid={state.testId}
        aria-busy={controlsDisabled && Boolean(state.busy)}
        onSubmit={submitCurrentMethod}
      >
        <VisuallyHidden live>{state.busy ? (state.busyLabel ?? 'Signing in…') : ''}</VisuallyHidden>
        {showCredentialFields ? (
          <>
            <div className='passflow-form-container'>
              {defaultMethod === 'email_or_username' ? (
                <div className='passflow-form-field'>
                  <div className='passflow-form-field__header'>
                    <label
                      htmlFor='email_or_username'
                      className={cn('passflow-field-label', {
                        'passflow-field-label--error': hasIdentityError || Boolean(identityError),
                      })}
                    >
                      {currentIdentity?.label}
                    </label>
                    {alternateIdentity ? (
                      <Button
                        size='small'
                        variant='clean'
                        type='button'
                        className='passflow-field-label-button'
                        disabled={controlsDisabled}
                        onClick={() => handleMethodChange(alternateIdentity.id)}
                      >
                        {alternateIdentity.selectLabel}
                      </Button>
                    ) : null}
                  </div>
                  <Controller
                    name='email_or_username'
                    control={control}
                    rules={{
                      required: currentIdentity?.requiredMessage ?? 'Identity is required',
                      ...(currentIdentity?.format === 'email'
                        ? { pattern: { value: emailRegex, message: 'Invalid email' } }
                        : undefined),
                    }}
                    render={({ field }) => (
                      <FieldText
                        {...field}
                        id='email_or_username'
                        type={currentIdentity?.format === 'email' ? 'email' : 'text'}
                        autoComplete={currentIdentity?.format === 'email' ? 'email' : 'username'}
                        aria-invalid={Boolean(identityError)}
                        aria-describedby={identityError ? 'email_or_username-error' : undefined}
                        isError={hasIdentityError || Boolean(identityError)}
                        disabled={controlsDisabled}
                      />
                    )}
                  />
                  {identityError?.message ? <LoginAlert id='email_or_username-error' message={identityError.message} /> : null}
                </div>
              ) : null}

              {defaultMethod === 'phone' ? (
                <div className='passflow-form-field'>
                  <div className='passflow-form-field__header'>
                    <label
                      htmlFor='phone'
                      className={cn('passflow-field-label', {
                        'passflow-field-label--error': hasIdentityError || Boolean(errors.phone),
                      })}
                    >
                      Phone number
                    </label>
                    {alternateIdentity ? (
                      <Button
                        size='small'
                        variant='clean'
                        type='button'
                        className='passflow-field-label-button'
                        disabled={controlsDisabled}
                        onClick={() => handleMethodChange(alternateIdentity.id)}
                      >
                        {alternateIdentity.selectLabel}
                      </Button>
                    ) : null}
                  </div>
                  <Controller
                    name='phone'
                    control={control}
                    rules={{
                      required: 'Phone number is required',
                      validate: (value) => phone(value).isValid || 'Invalid phone number',
                    }}
                    render={({ field }) => (
                      <FieldPhone
                        id='phone'
                        name='phone'
                        onChange={field.onChange}
                        aria-describedby={errors.phone ? 'phone-error' : undefined}
                        isError={hasIdentityError || Boolean(errors.phone)}
                        disabled={controlsDisabled}
                        ref={null}
                      />
                    )}
                  />
                  {errors.phone?.message ? <LoginAlert id='phone-error' message={errors.phone.message} /> : null}
                </div>
              ) : null}

              {hasPassword ? (
                <div className='passflow-form-field'>
                  <div className='passflow-form-field__header'>
                    <label
                      htmlFor='password'
                      className={cn('passflow-field-label', {
                        'passflow-field-label--error': hasPasswordError || Boolean(errors.password),
                      })}
                    >
                      Password
                    </label>
                    {state.forgotPassword ? (
                      <Link
                        to={state.forgotPassword.to}
                        search={state.forgotPassword.getSearch?.(defaultMethod)}
                        className='passflow-field-label-button'
                        disabled={controlsDisabled}
                      >
                        Forgot Password?
                      </Link>
                    ) : null}
                  </div>
                  <Controller
                    name='password'
                    control={control}
                    rules={{ required: 'Password is required', validate: validatePassword }}
                    render={({ field }) => (
                      <FieldPassword
                        {...field}
                        id='password'
                        name='password'
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password && !isNewPassword ? 'password-error' : undefined}
                        isError={hasPasswordError || Boolean(errors.password)}
                        passwordPolicy={state.passwordPolicy}
                        withMessages={isNewPassword}
                        validationErrors={
                          isNewPassword && errors.password?.message ? errors.password.message.split(', ') : undefined
                        }
                        autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                        disabled={controlsDisabled}
                      />
                    )}
                  />
                  {!isNewPassword && errors.password?.message ? (
                    <LoginAlert id='password-error' message={errors.password.message} />
                  ) : null}
                </div>
              ) : null}

              {formAlert}
            </div>

            <LoginActionStack>
              {hasPassword && state.onPassword ? (
                <Button
                  size='big'
                  variant='primary'
                  type='submit'
                  loading={loadingAction === 'password'}
                  disabled={loadingAction !== 'password' && (controlsDisabled || !isDirty || !isValid)}
                  className='passflow-button-signin'
                  data-testid={state.primaryTestId}
                >
                  {state.primaryLabel ?? 'Sign In'}
                </Button>
              ) : null}
              {hasPasswordless && state.onPasswordless ? (
                <Button
                  size='big'
                  variant={hasPassword ? 'outlined' : 'primary'}
                  type='button'
                  className={cn('passflow-button-passwordless', {
                    'passflow-button-passwordless--active': hasPassword,
                  })}
                  loading={loadingAction === 'passwordless'}
                  disabled={loadingAction !== 'passwordless' && (controlsDisabled || selectedIdentityValue.trim().length === 0)}
                  onClick={() => void submitPasswordless()}
                >
                  {state.passwordlessLabelPrefix ?? 'Sign In with'} {currentIdentity?.passwordlessLabel}
                </Button>
              ) : null}
              {hasPasskey ? passkeyAction : null}
            </LoginActionStack>
          </>
        ) : null}

        {showStandalonePasskey ? (
          <>
            {formAlert}
            {passkeyAction ? <LoginActionStack>{passkeyAction}</LoginActionStack> : null}
          </>
        ) : null}

        {state.footer ? (
          <div className={cn('passflow-form-actions', { 'passflow-form-actions--top-space': hasCredentialActions })}>
            <p className='passflow-dont-have-account'>
              {state.footer.prompt}{' '}
              <Link to={state.footer.to} search={state.footer.search} className='passflow-link' disabled={controlsDisabled}>
                {state.footer.label}
              </Link>
            </p>
          </div>
        ) : null}

        {methods.providers.length > 0 && state.onProvider ? (
          <div className='passflow-form-providers'>
            {hasCredentialActions ? <LoginDivider label='Or continue with' /> : null}
            <ProvidersBox providers={methods.providers} onClick={state.onProvider} disabled={controlsDisabled} />
          </div>
        ) : null}
      </form>
    </>
  );
};
