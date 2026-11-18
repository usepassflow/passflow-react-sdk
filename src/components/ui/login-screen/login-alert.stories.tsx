import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { LoginAlert } from './shared';

/**
 * A message under a login form. `error` is announced as an alert with a warning
 * icon; `info` is a neutral note announced as a status. Nothing renders without
 * a message.
 */
const meta = {
  title: 'Components/LoginAlert',
  component: LoginAlert,
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof LoginAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A neutral note, such as why the user landed on this screen. */
export const Info: Story = {
  args: {
    tone: 'info',
    message: 'You must change your password before you can sign in. Reset your password to continue.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'You must change your password before you can sign in. Reset your password to continue.',
    );
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

/** A failure the user must notice. */
export const ErrorTone: Story = {
  name: 'Error',
  args: {
    message: "We couldn't send the reset instructions. Try again later.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent("We couldn't send the reset instructions. Try again later.");
    await expect(canvas.queryByRole('status')).toBeNull();
  },
};
