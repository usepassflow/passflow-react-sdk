import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import { FieldPhone } from './field-phone';

/**
 * Owns the value, so each story can be typed into. Below the field it shows what
 * the form last received and how many changes were reported, so a test can check
 * the form agrees with what the field shows.
 */
const Controlled = (props: ComponentProps<typeof FieldPhone>) => {
  const [value, setValue] = useState(props.value);
  const [changes, setChanges] = useState(0);
  return (
    <div className='passflow-field-container'>
      <label htmlFor={props.id} className='passflow-field-label'>
        Phone
      </label>
      <FieldPhone
        {...props}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setChanges((count) => count + 1);
          props.onChange(event);
        }}
      />
      <p data-testid='field-phone-story-value'>{value}</p>
      <p data-testid='field-phone-story-changes'>{changes}</p>
    </div>
  );
};

/**
 * A phone number with a country picker. A starting `value` (an international
 * number) is shown formatted, with its country selected.
 */
const meta = {
  title: 'Components/FieldPhone',
  component: FieldPhone,
  args: {
    id: 'field-phone-story',
    name: 'phone',
    value: '',
    onChange: fn(),
  },
  render: (args) => <Controlled {...args} />,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof FieldPhone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** Opened with a number already known, such as one carried over from sign-in. */
export const Prefilled: Story = {
  args: { value: '+447700900123' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Phone') as HTMLInputElement;
    await expect(input.value.replace(/\D/g, '')).toBe('447700900123');
    await expect(canvas.getByRole('button', { name: /current GB/ })).toBeVisible();
  },
};
