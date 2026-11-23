import type { PassflowSendPasswordResetEmailPayload } from '@passflow/core';
import { phone } from 'phone';
/* eslint-disable max-len */
/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable complexity */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { type FC, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as Yup from 'yup';
import { AntiBotCheck, Button, FieldPhone, FieldText, Icon, Link, LoginAlert } from '@/components/ui';
import { routes, useSearchSource } from '@/context';
import { withHydration } from '@/hocs/with-hydration';
import { useAntiBot, useAppSettings, useForgotPassword, useNavigation } from '@/hooks';
import {
  cn,
  emailRegex,
  getAuthMethods,
  getIdentityLabel,
  passwordChangeRequiredMessage,
  passwordChangeRequiredReason,
  useUrlParams,
} from '@/utils';
import { Wrapper } from '../wrapper';

import '@/styles/index.css';
import queryString from 'query-string';

const searchParamsForgotPasswordSchema = Yup.object().shape({
  defaultMethod: Yup.string().oneOf(['email_or_username', 'phone']).required(),
});

type TForgotPassword = {
  successResetRedirect?: string;
  signInPath?: string;
  forgotPasswordSuccessPath?: string;
};

const ForgotPasswordScreen: FC<TForgotPassword> = ({
  successResetRedirect,
  signInPath = routes.signin.path,
  forgotPasswordSuccessPath = routes.forgot_password_success.path,
}) => {
  const { get } = useUrlParams({
    default_method: '',
    email: '',
    username: '',
    phone: '',
  });

  const {
    getValues,
    control,
    formState: { errors, isValid },
  } = useForm({
    defaultValues: {
      email_or_username: get('email') || get('username') || '',
      phone: get('phone') ?? '',
    },
  });

  const { appSettings, currentStyles, isError: isErrorApp, error: errorApp, loginAppTheme } = useAppSettings();

  if (isErrorApp) throw new Error(errorApp);

  const authMethods = useMemo(() => getAuthMethods(appSettings?.auth_strategies), [appSettings]);
  const { navigate } = useNavigation();
  const searchSource = useSearchSource();

  const params = {
    defaultMethod: get('default_method'),
  };
  const showPasswordChangeNotice = get('reason') === passwordChangeRequiredReason;

  try {
    searchParamsForgotPasswordSchema.validateSync(params, { abortEarly: false });
  } catch (err) {
    throw new Error('Invalid default method param');
  }

  const { defaultMethod } = params;

  const { fetch, error, isError, isLoading } = useForgotPassword();
  const antiBot = useAntiBot(appSettings);

  const onSubmitHanlder = async () => {
    const values = getValues();
    // Only the field on screen is sent: the URL may prefill the other one, which the user never sees.
    const usesPhone = defaultMethod === 'phone';
    const isEmail = !usesPhone && values.email_or_username.match(emailRegex);
    const isUsername = !usesPhone && !isEmail && values.email_or_username.length > 0;
    const validatedPhone = phone(values.phone);
    const isPhone = usesPhone && validatedPhone.isValid;

    const payload = {
      ...(isEmail && { email: values.email_or_username }),
      ...(isUsername && { username: values.email_or_username }),
      ...(isPhone && { phone: validatedPhone.phoneNumber }),
      ...(successResetRedirect && { redirect_url: successResetRedirect }),
    } as PassflowSendPasswordResetEmailPayload;

    const status = await fetch(payload);

    if (status) {
      const currentSearchParams = new URLSearchParams(searchSource.read());
      for (const name of ['redirect_url', 'email', 'phone', 'username']) currentSearchParams.delete(name);
      const newParams = queryString.stringify({
        ...Object.fromEntries(currentSearchParams.entries()),
        ...payload,
      });
      navigate({ to: forgotPasswordSuccessPath, search: newParams });
    }
  };

  // if (!state)
  //   return (
  //     <Navigate
  //       to={{
  //         pathname: signInPath ?? routes.signin.path,
  //         search: window.location.search,
  //       }}
  //       replace
  //     />
  //   );

  const currentSubtitle =
    defaultMethod === 'email_or_username'
      ? 'Enter the email address you used when you joined and we’ll send you instructions to reset your password.'
      : 'Enter the mobile phone number you used when you joined and we’ll send you the reset link.';

  const currentSubscriptions =
    defaultMethod === 'email_or_username'
      ? 'For security reasons, we do NOT store your password. So rest assured that we will never send your password via email.'
      : 'For security reasons, we do NOT store your password. So rest assured that we will never send your password via SMS.';

  return (
    <Wrapper
      title='Forgot password?'
      subtitle={currentSubtitle}
      className='passflow-forgot-password-wrapper'
      customCss={currentStyles?.custom_css}
      customLogo={currentStyles?.logo_url}
      removeBranding={loginAppTheme?.remove_passflow_logo}
    >
      <span className='passflow-form-subscriptions'>{currentSubscriptions}</span>
      <form onSubmit={(e) => e.preventDefault()} className='passflow-form'>
        {showPasswordChangeNotice && <LoginAlert tone='info' message={passwordChangeRequiredMessage} />}
        <div className='passflow-form-container'>
          <div className='passflow-form-field'>
            {defaultMethod === 'email_or_username' && (
              <>
                <div className='passflow-form-field__header'>
                  <label htmlFor='identity' className={cn('passflow-field-label', { 'passflow-field-label--error': isError })}>
                    {getIdentityLabel(authMethods, 'label')}
                  </label>
                </div>
                <Controller
                  name='email_or_username'
                  control={control}
                  rules={{ required: 'Email is required' }}
                  render={({ field }) => (
                    <FieldText
                      {...field}
                      isError={isError || Object.hasOwn(errors, 'email_or_username')}
                      id='email_or_username'
                      type='text'
                      name='email_or_username'
                    />
                  )}
                />
              </>
            )}
            {defaultMethod === 'phone' && (
              <>
                <div className='passflow-form-field__header'>
                  <label htmlFor='phone' className={cn('passflow-field-label', { 'passflow-field-label--error': isError })}>
                    Phone
                  </label>
                </div>
                <Controller
                  name='phone'
                  control={control}
                  rules={{
                    required: 'Phone is required',
                    validate: (value) => {
                      const validatePhone = phone(value);
                      if (validatePhone.isValid) return true;
                      return 'Invalid phone number';
                    },
                  }}
                  render={({ field }) => (
                    <FieldPhone
                      {...field}
                      onChange={(e) => field.onChange(e)}
                      id='phone'
                      name='phone'
                      isError={isError || Object.hasOwn(errors, 'phone')}
                      ref={null}
                    />
                  )}
                />
              </>
            )}
            {isError && (
              <div className='passflow-form-error'>
                <Icon size='small' id='warning' type='general' className='icon-warning' />
                <span className='passflow-form-error-text'>{error}</span>
              </div>
            )}
          </div>
        </div>
        {antiBot ? <AntiBotCheck {...antiBot} /> : null}
        <div className='passflow-send-reset-wrapper'>
          <Button
            size='big'
            variant='primary'
            type='button'
            disabled={!isValid || isLoading}
            className='passflow-button-send-reset-password'
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onClick={onSubmitHanlder}
          >
            Send reset instructions
          </Button>
          <p className='passflow-remember-password'>
            Remember your password?{' '}
            <Link to={signInPath ?? routes.signin.path} className='passflow-link'>
              Sign In
            </Link>{' '}
          </p>
        </div>
      </form>
    </Wrapper>
  );
};

export const ForgotPassword = withHydration(ForgotPasswordScreen);
