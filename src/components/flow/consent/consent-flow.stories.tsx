import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsentFlow } from './index';

/**
 * The consent flow against `GET /oidc/requests/{consent_challenge_id}`. Add
 * `&consent_challenge_id=…` to the iframe URL; without it the flow shows its
 * invalid-link screen.
 */
const meta = {
  title: 'Flows/ConsentFlow',
  component: ConsentFlow,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof ConsentFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
