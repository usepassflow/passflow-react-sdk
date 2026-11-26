import { type ChangeEvent, type FC, useId } from 'react';
import { cn } from '@/utils';

type TSwitch = {
  label: string;
  /** A second, quieter line under the label. Not rendered when empty. */
  description?: string;
  checked: boolean;
  disabled?: boolean;
  /**
   * `inline` puts the track right after the label. `row` fills the width of its
   * container and puts the track on the far edge, so the tracks of stacked rows
   * line up in one column however long each label is.
   */
  layout?: 'inline' | 'row';
  /**
   * Overrides the generated input id. Only needed when something outside this
   * component has to point at the input (`aria-describedby`, a test hook, a
   * label rendered elsewhere).
   *
   * The default is a `useId()` value rather than a constant, because a constant
   * breaks the moment a screen renders more than one Switch: duplicate DOM ids
   * are invalid, and every `<label htmlFor>` would resolve to the FIRST input,
   * so clicking row three would toggle row one. The consent screen renders one
   * Switch per requested scope, so this is load-bearing, not hygiene.
   */
  id?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export const Switch: FC<TSwitch> = ({ label, description, checked, disabled = false, layout = 'inline', id, onChange }) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;
  const descriptionId = `${inputId}-description`;

  return (
    <label
      className={cn('passflow-switch-wrapper', {
        'passflow-switch-wrapper--row': layout === 'row',
        'passflow-switch-wrapper--disabled': disabled,
      })}
      htmlFor={inputId}
    >
      <span className='passflow-switch-text'>
        <span id={labelId} className='passflow-switch-label'>
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className='passflow-switch-description'>
            {description}
          </span>
        ) : null}
      </span>
      <input
        id={inputId}
        type='checkbox'
        role='switch'
        aria-checked={checked}
        className='passflow-switch-input'
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onChange={onChange}
      />
      <div className='passflow-switch-track' />
    </label>
  );
};
