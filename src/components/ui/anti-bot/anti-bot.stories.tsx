import type { Meta, StoryObj } from '@storybook/react-vite';
import { type FC, type PropsWithChildren, useCallback, useState } from 'react';
import { Button } from '../button';
import { AntiBotCheck } from './anti-bot-check';
import { type FakeAntiBotOptions, installFakeAntiBotVendors } from './fake-vendors';
import type { AntiBotGetToken, AntiBotVendor } from './vendors';
import './anti-bot.stories.css';

/** Installs fresh fake vendor globals once, before the check below it mounts its widget. */
const FakeVendors: FC<PropsWithChildren<{ options?: FakeAntiBotOptions }>> = ({ options, children }) => {
  useState(() => installFakeAntiBotVendors(options));
  return children;
};

/** The check plus a "Get token" button that asks the widget for a token, the way core does before a request. */
const TokenHarness: FC<{ provider: AntiBotVendor; siteKey: string }> = ({ provider, siteKey }) => {
  const [getToken, setGetToken] = useState<AntiBotGetToken | undefined>(undefined);
  const [result, setResult] = useState('No token yet');
  const onReady = useCallback((next: AntiBotGetToken | undefined) => setGetToken(() => next), []);

  const requestToken = async () => {
    if (!getToken) return;
    try {
      setResult(await getToken());
    } catch {
      setResult('Token refused');
    }
  };

  return (
    <section aria-label='Anti-bot check' className='passflow-anti-bot-story'>
      <AntiBotCheck provider={provider} siteKey={siteKey} onReady={onReady} />
      <Button size='big' variant='primary' type='button' disabled={!getToken} onClick={requestToken}>
        Get token
      </Button>
      <output data-testid='anti-bot-token' aria-live='polite' className='passflow-anti-bot-story-token'>
        {getToken ? result : 'Check not ready'}
      </output>
    </section>
  );
};

const vendorStory = (provider: AntiBotVendor, options?: FakeAntiBotOptions): StoryObj<typeof AntiBotCheck> => ({
  render: () => (
    <FakeVendors options={options}>
      <TokenHarness provider={provider} siteKey={`${provider}-site-key`} />
    </FakeVendors>
  ),
});

const meta = {
  title: 'Components/AntiBotCheck',
  component: AntiBotCheck,
  tags: ['autodocs'],
} satisfies Meta<typeof AntiBotCheck>;

export default meta;
type Story = StoryObj<typeof AntiBotCheck>;

/**
 * Built-in check while nothing is being solved: the element renders nothing,
 * so the frame around it only shows the caption.
 */
export const BuiltinIdle: Story = {
  args: { provider: 'builtin', solving: false },
  render: (args) => (
    <section aria-label='Anti-bot check' className='passflow-anti-bot-story'>
      <p className='passflow-anti-bot-story-caption'>The built-in check is idle and draws nothing.</p>
      <AntiBotCheck {...args} />
    </section>
  ),
};

/** Built-in check while core solves the proof of work for a request. */
export const BuiltinSolving: Story = {
  args: { provider: 'builtin', solving: true },
  render: (args) => (
    <section aria-label='Anti-bot check' className='passflow-anti-bot-story'>
      <AntiBotCheck {...args} />
    </section>
  ),
};

/** Turnstile on demand: it draws only when it needs an interaction (the fake marks its box). Every token is fresh. */
export const Turnstile: Story = vendorStory('turnstile');

/** Invisible hCaptcha: each token request runs `execute` and resets the widget. */
export const HCaptcha: Story = vendorStory('hcaptcha');

/** reCAPTCHA v3: nothing is drawn in the container; each token is executed with the `passflow_auth` action. */
export const Recaptcha: Story = vendorStory('recaptcha');

/** The widget did not render (or its script did not load): `onReady` is never called, so no token can be asked for. */
export const VendorNotReady: Story = vendorStory('turnstile', { failRender: true });

/** Turnstile is ready, but the vendor refuses the token request; the form would show the plain anti-bot message. */
export const TurnstileTokenRefused: Story = vendorStory('turnstile', { failExecute: true });

/** hCaptcha refuses the token request (for example the challenge was closed); the widget is still reset. */
export const HCaptchaTokenRefused: Story = vendorStory('hcaptcha', { failExecute: true });
