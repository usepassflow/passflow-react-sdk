import type { AuthRedirectOptions } from '@passflow/core';
import { type FC, type ReactElement, type ReactNode, useState } from 'react';
import { type LoginButtonAppearance, LoginButtonView } from '@/components/ui/login-button';
import { useAuth } from '@/hooks/use-auth';
import { usePassflow } from '@/hooks/use-passflow';
import { type PassflowUser, useUser } from '@/hooks/use-user';
import { startHostedSignIn } from '@/utils/hosted-sign-in';

/** What a function child of `LoginButton` receives. */
export type LoginButtonRenderProps = {
  isSignedIn: boolean;
  /** The label the default button would show now: `signInLabel`, or the signed-in label. */
  label: ReactNode;
  user: PassflowUser;
  /** True while the sign-out is in flight; a click then does nothing. */
  busy: boolean;
};

export type LoginButtonProps = {
  /** Shown while signed out. Default "Sign in". */
  signInLabel?: ReactNode;
  /** Shown while signed in. Default: the user's email, else the phone, else "Sign out". */
  signedInLabel?: (user: PassflowUser) => ReactNode;
  /** Read by assistive technology after the signed-in label, since a click signs out. Default "Sign out". */
  signOutDescription?: string;
  /**
   * Passed to `passflow.authRedirect()` on sign-in. Without `redirectUrl`, the hosted login returns to the app
   * root, `${origin}/` (the URL to register), and the provider then takes the user back to the page they
   * started on. A `redirectUrl` given here is used as it is.
   */
  authRedirectOptions?: AuthRedirectOptions;
  /** After a hosted sign-in: where the hosted login sends the browser once signed out. */
  postLogoutRedirectUri?: string;
  /** The look of the default button. Default `passflow`; `shadcn` follows the host app's shadcn/ui theme. */
  appearance?: LoginButtonAppearance;
  /**
   * Your own element as the button, in place of the default one. It is cloned
   * with a click handler that first calls its own `onClick`, then signs in or
   * out unless that called `event.preventDefault()`. A child that calls
   * `onClick()` with no event still signs in or out. Its content is kept as it
   * is: no label is injected. While the sign-out is in flight it gets
   * `disabled` and `aria-busy`; otherwise those stay as you passed them. For a
   * label that switches, pass a function that returns the element; it also
   * receives `busy`.
   */
  children?: ReactElement | ((props: LoginButtonRenderProps) => ReactElement);
};

const defaultSignedInLabel = (user: PassflowUser): ReactNode => user.email ?? user.phone ?? 'Sign out';

/**
 * One button that signs in or out. Signed out, a click starts the hosted
 * sign-in (`startHostedSignIn()`); signed in, it shows who is signed in and
 * a click signs out (`useAuth().logout()`). It switches on sign-in and
 * sign-out events.
 *
 * @example
 * ```tsx
 * <LoginButton />
 * <LoginButton appearance='shadcn' postLogoutRedirectUri='https://app.example.com/' />
 * <LoginButton><MyButton>Account</MyButton></LoginButton>
 * <LoginButton>{({ label }) => <MyButton>{label}</MyButton>}</LoginButton>
 * ```
 */
export const LoginButton: FC<LoginButtonProps> = ({
  signInLabel = 'Sign in',
  signedInLabel = defaultSignedInLabel,
  signOutDescription,
  authRedirectOptions,
  postLogoutRedirectUri,
  appearance,
  children,
}) => {
  const passflow = usePassflow();
  const { isSignedIn, logout } = useAuth();
  const user = useUser();
  const [signingOut, setSigningOut] = useState(false);

  const label = isSignedIn ? signedInLabel(user) : signInLabel;

  // A failure is reported by core's Error event; the button only returns to its idle state.
  const handleClick = () => {
    if (signingOut) return;
    if (!isSignedIn) {
      startHostedSignIn(passflow, authRedirectOptions).catch(() => undefined);
      return;
    }
    setSigningOut(true);
    logout(postLogoutRedirectUri ? { postLogoutRedirectUri } : undefined)
      .catch(() => undefined)
      .finally(() => setSigningOut(false));
  };

  return (
    <LoginButtonView
      state={signingOut ? 'signing-out' : isSignedIn ? 'signed-in' : 'signed-out'}
      label={label}
      signOutDescription={signOutDescription}
      appearance={appearance}
      onClick={handleClick}
    >
      {typeof children === 'function' ? children({ isSignedIn, label, user, busy: signingOut }) : children}
    </LoginButtonView>
  );
};
