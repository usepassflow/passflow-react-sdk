import type { PassflowPasswordPolicySettings } from '@passflow/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import { expect, within } from 'storybook/test';
import { FieldPassword } from './field-password';

const policy = (overrides: Partial<PassflowPasswordPolicySettings> = {}): PassflowPasswordPolicySettings => ({
  restrict_min_password_length: true,
  min_password_length: 8,
  reject_compromised: false,
  enforce_password_strength: 'none',
  require_lowercase: true,
  require_uppercase: true,
  require_number: true,
  require_symbol: false,
  ...overrides,
});

/** Owns the value, so each story can be typed into. */
const Controlled = (props: ComponentProps<typeof FieldPassword>) => {
  const [value, setValue] = useState(props.value);
  return (
    <div className='passflow-field-container'>
      <label htmlFor={props.id} className='passflow-field-label'>
        Password
      </label>
      <FieldPassword {...props} value={value} onChange={(event) => setValue(event.target.value)} />
    </div>
  );
};

/**
 * A password input with the policy's rules listed under it. A rule the policy does
 * not enforce is not listed: no length line when the minimum is not restricted, no
 * "Must contain" line when no character class is required.
 */
const meta = {
  title: 'Components/FieldPassword',
  component: FieldPassword,
  args: {
    id: 'field-password-story',
    name: 'password',
    value: '',
    withMessages: true,
    passwordPolicy: policy(),
  },
  render: (args) => <Controlled {...args} />,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof FieldPassword>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A restricted minimum and required character classes: both lines show. */
export const FullPolicy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('At least 8 characters')).toBeVisible();
    await expect(canvas.getByText('Must contain a number, lowercase letter, and uppercase letter')).toBeVisible();
  },
};

/** The minimum is not restricted: no length line, only the character classes. */
export const LengthNotRestricted: Story = {
  args: {
    passwordPolicy: policy({
      restrict_min_password_length: false,
      min_password_length: 12,
      require_lowercase: false,
      require_uppercase: false,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Must contain a number')).toBeVisible();
    await expect(canvas.queryByText(/At least \d+ characters/)).toBeNull();
  },
};

/** No character class is required: only the length line. */
export const LengthOnly: Story = {
  args: {
    passwordPolicy: policy({ require_lowercase: false, require_uppercase: false, require_number: false }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('At least 8 characters')).toBeVisible();
    await expect(canvas.queryByText(/Must contain/)).toBeNull();
  },
};

/** The policy enforces neither: no rules list at all. */
export const NoRequirements: Story = {
  args: {
    passwordPolicy: policy({
      restrict_min_password_length: false,
      require_lowercase: false,
      require_uppercase: false,
      require_number: false,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Password')).toBeVisible();
    await expect(canvas.queryByText(/At least \d+ characters/)).toBeNull();
    await expect(canvas.queryByText(/Must contain/)).toBeNull();
  },
};
