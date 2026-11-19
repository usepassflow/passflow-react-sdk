import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LoginButtonView } from './login-button';

/**
 * Stands in for a host app's shadcn/ui theme: the story's `shadcn` parameter is
 * set as custom properties on a wrapper, the way an app sets them on `:root`.
 */
const withShadcnHost: Decorator = (Story, { parameters }) => {
  const variables = parameters.shadcn as Record<string, string> | undefined;
  if (!variables) return <Story />;
  return (
    <div data-testid='shadcn-host' style={variables as CSSProperties}>
      <Story />
    </div>
  );
};

/**
 * The sign-in / sign-out button. `LoginButton` picks the state from the
 * session; this primitive owns every look.
 */
const meta = {
  title: 'Components/LoginButton',
  component: LoginButtonView,
  decorators: [withShadcnHost],
  args: {
    state: 'signed-out',
    label: 'Sign in',
    onClick: fn(),
  },
  parameters: {
    controls: { disable: true },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof LoginButtonView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nobody is signed in: a click starts the hosted sign-in. */
export const SignedOut: Story = {};

/** Signed in: shows who, and a click signs out. "Sign out" is the button's accessible description. */
export const SignedIn: Story = {
  args: { state: 'signed-in', label: 'jane@example.com' },
};

/** The sign-out is in flight: disabled and `aria-busy`. */
export const SigningOut: Story = {
  args: { state: 'signing-out', label: 'jane@example.com' },
};

/**
 * The app's own element is the button. It keeps its props, content and look;
 * only the click is added, after the element's own `onClick`.
 */
export const WrappedChild: Story = {
  args: {
    children: (
      <button type='button' className='app-button' data-variant='ghost'>
        Continue with Passflow
      </button>
    ),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Continue with Passflow' }));
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** An older shadcn theme: colours are bare HSL triplets, used by the app as `hsl(var(--primary))`. */
export const ShadcnHslTriplet: Story = {
  args: { appearance: 'shadcn' },
  parameters: {
    shadcn: {
      '--primary': '222.2 47.4% 11.2%',
      '--primary-foreground': '210 40% 98%',
      '--ring': '215 20.2% 65.1%',
      '--radius': '0.5rem',
      '--font-sans': 'Georgia, serif',
    },
  },
};

/** A Tailwind v4 shadcn theme: colours are complete values, here oklch and hex. */
export const ShadcnOklchHex: Story = {
  args: { appearance: 'shadcn' },
  parameters: {
    shadcn: {
      '--primary': 'oklch(0.205 0 0)',
      '--primary-foreground': '#fafafa',
      '--ring': 'oklch(0.708 0 0)',
      '--radius': '0.625rem',
      '--font-sans': '"Courier New", monospace',
    },
  },
};

/** No shadcn variables at all: the Passflow tokens fill in, and the font is inherited. */
export const ShadcnMissingVariables: Story = {
  args: { appearance: 'shadcn' },
  parameters: { shadcn: {} },
};
