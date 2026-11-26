import type { FC } from 'react';
import './visually-hidden.css';

export type VisuallyHiddenProps = {
  /** Referenced by a control's `aria-labelledby` or `aria-describedby`. */
  id?: string;
  /** The text read by assistive technology. Plain text only. */
  children: string;
  /**
   * A polite status message: screen readers announce each change of the text.
   * Keep it rendered and change its text, because a status that appears with
   * its text already in place is often not announced.
   */
  live?: boolean;
};

/**
 * Text that screen readers announce and sighted users do not see.
 *
 * For a control whose purpose the screen already shows another way, for
 * example a row of code boxes under a "We sent a code" subtitle, so it still
 * has an accessible name. Prefer pointing the control at visible text when
 * the screen has some.
 */
export const VisuallyHidden: FC<VisuallyHiddenProps> = ({ id, children, live = false }) => (
  <span id={id} className='passflow-visually-hidden' role={live ? 'status' : undefined}>
    {children}
  </span>
);
