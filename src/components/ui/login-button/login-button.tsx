import { cloneElement, type FC, type MouseEvent, type ReactElement, type ReactNode, useId, useRef } from 'react';
import { cn } from '@/utils';
import '@/styles/index.css';
import { VisuallyHidden } from '../visually-hidden';
import { useShadcnTheme } from './use-shadcn-theme';
import './login-button.css';

/**
 * `passflow` is the Passflow look. `shadcn` takes the colours, radius, focus
 * ring and font from the host app's shadcn/ui variables (`--primary`,
 * `--primary-foreground`, `--radius`, `--ring`, `--font-sans`), in either the
 * HSL-triplet or the complete-colour format, and falls back to the Passflow
 * tokens for any that are missing.
 */
export type LoginButtonAppearance = 'passflow' | 'shadcn';

/** `signing-out` is the signed-in button while the sign-out is in flight: disabled and busy. */
export type LoginButtonViewState = 'signed-out' | 'signed-in' | 'signing-out';

export type LoginButtonViewProps = {
  state: LoginButtonViewState;
  /** The visible content of the default button. Ignored when `children` is given. */
  label: ReactNode;
  /** Read by assistive technology after the name while signed in, since clicking signs out. */
  signOutDescription?: string;
  appearance?: LoginButtonAppearance;
  /** The sign-in or sign-out. Not called when a wrapped child's own `onClick` calls `preventDefault()`. */
  onClick: () => void;
  /**
   * The app's own element to use as the button instead of the default one. It
   * is cloned with a click handler and otherwise left as it is: its props,
   * content and look are its own, and no label is injected. While signing out
   * it also gets `disabled` and `aria-busy`; when idle those stay as the app
   * passed them.
   */
  children?: ReactElement;
};

type ClickableProps = { onClick?: (event?: MouseEvent<HTMLElement>) => void };
type ChildProps = ClickableProps & { disabled?: boolean; 'aria-busy'?: boolean };

/**
 * The sign-in / sign-out button. It renders a state and calls `onClick`; the
 * `LoginButton` runtime component decides the state and does the sign-in or
 * sign-out.
 */
export const LoginButtonView: FC<LoginButtonViewProps> = ({
  state,
  label,
  signOutDescription = 'Sign out',
  appearance = 'passflow',
  onClick,
  children,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  useShadcnTheme(buttonRef, appearance === 'shadcn' && !children);

  const busy = state === 'signing-out';

  if (children) {
    const own = (children.props as ClickableProps).onClick;
    return cloneElement(children as ReactElement<ChildProps>, {
      // Some UI libraries call `onClick()` with no event; then there is nothing to have been prevented.
      onClick: (event?: MouseEvent<HTMLElement>) => {
        own?.(event);
        if (!event?.defaultPrevented) onClick();
      },
      // Set only while busy, so an idle child keeps its own `disabled` and `aria-busy`.
      ...(busy ? { disabled: true, 'aria-busy': true } : {}),
    });
  }

  const signedIn = state !== 'signed-out';

  // The description is a sibling, not a child: inside the button it would join the button's name.
  return (
    <>
      <button
        ref={buttonRef}
        type='button'
        className={cn('passflow-login-button', {
          'passflow-login-button--shadcn': appearance === 'shadcn',
        })}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-describedby={signedIn ? descriptionId : undefined}
        onClick={onClick}
      >
        {label}
      </button>
      {signedIn ? <VisuallyHidden id={descriptionId}>{signOutDescription}</VisuallyHidden> : null}
    </>
  );
};
