import AxeBuilder from '@axe-core/playwright';
// Coverage map: REQ-5 (FR5)
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';
const storyTitle = 'Components/UpgradeDialog';
const stories = [
  ['Challenge', 'challenge'],
  ['ChallengeAlternatives', 'challenge-alternatives'],
  ['ChallengeAwaitingCode', 'challenge-awaiting-code'],
  ['ChallengeRecoveryCodeContract', 'challenge-recovery-code-contract'],
  ['ChallengeWrongCode', 'challenge-wrong-code'],
  ['ChallengeFactorNotRegistered', 'challenge-factor-not-registered'],
  ['ChallengeSubmitting', 'challenge-submitting'],
  ['ChallengeSingleFactor', 'challenge-single-factor'],
  ['PasskeySuggested', 'passkey-suggested'],
  ['Working', 'working'],
  ['Success', 'success'],
  ['SuccessManualClose', 'success-manual-close'],
  ['Insufficient', 'insufficient'],
  ['InsufficientSignInAgain', 'insufficient-sign-in-again'],
  ['InsufficientFreshness', 'insufficient-freshness'],
  ['Cancelled', 'cancelled'],
  ['TransportFailureRetryable', 'transport-failure-retryable'],
  ['TransportFailureFinal', 'transport-failure-final'],
  ['NoUsableFactor', 'no-usable-factor'],
  ['Unavailable', 'unavailable'],
  ['Exhausted', 'exhausted'],
  ['RateLimited', 'rate-limited'],
  ['AttemptsExhausted', 'attempts-exhausted'],
  ['CustomTitle', 'custom-title'],
] as const;

async function openStory(page: Page, id: string) {
  await page.goto(`${storybookUrl}/iframe.html?id=components-upgradedialog--${id}&viewMode=story`);
  await waitForStoryRendered(page);
  // Dialogs are portaled outside #storybook-root. An empty render must fail,
  // including Success: closing is not evidence that its visible state was audited.
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function auditStory(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await expect(page.getByRole('dialog')).toBeVisible();
      const audit = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      // Reject both an empty render and an audit that evaluated no passing nodes.
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(audit.passes.some(result => result.nodes.length > 0),
        'The accessibility audit must evaluate the rendered dialog').toBe(true);
      return audit;
    } catch (error) {
      const reload = error instanceof Error &&
        (error.message.includes('Axe is already running') || error.message.includes('Execution context was destroyed'));
      if (!reload || attempt === 4) throw error;
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  }
  throw new Error('Storybook never stabilised for accessibility audit');
}

test.describe('REQ-FR5 UpgradeDialog public story states', () => {
  for (const [name, id] of stories) {
    test(`REQ-FR5 UpgradeDialog · ${name} · catalogued state is accessible without runtime errors`, async ({ page, request }) => {
      const response = await request.get(`${storybookUrl}/index.json`);
      expect(response.ok()).toBe(true);
      const index = await response.json() as {
        entries: Record<string, { id: string; title: string; type: string }>;
      };
      expect(index.entries[`components-upgradedialog--${id}`]).toMatchObject({ title: storyTitle, type: 'story' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await openStory(page, id);
      const audit = await auditStory(page);
      expect(audit.violations, name).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('REQ-FR5 ChallengeCancel · required cancel-action story is catalogued and accessible', async ({ page, request }) => {
    // §10.2 requires a challenge with onCancel, not the terminal Cancelled panel
    // (which has onDismiss). Audit the supported challenge without inventing a URL.
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openStory(page, 'challenge');
    const audit = await auditStory(page);
    expect(audit.violations, 'Challenge cancel-action state').toEqual([]);
    expect(errors).toEqual([]);

    const response = await request.get(`${storybookUrl}/index.json`);
    expect(response.ok()).toBe(true);
    const index = await response.json() as {
      entries: Record<string, { title: string; type: string; name: string }>;
    };
    expect(
      Object.values(index.entries).some(entry =>
        entry.title === storyTitle && entry.type === 'story' && entry.name === 'Challenge Cancel'),
      'Catalog gap (§10.2): ChallengeCancel — onCancel is a fn() spy; cancel resolves the caller cleanly. Cancelled is a different terminal state.',
    ).toBe(true);
  });

  test('REQ-FR5 ChallengeAlternatives · offers another factor without closing the prompt', async ({ page }) => {
    // Challenge is controlled; the catalog owns its expanded state separately.
    await openStory(page, 'challenge');
    await expect(page.getByRole('button', { name: /use another way/i })).toBeVisible();
    await openStory(page, 'challenge-alternatives');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Passkey\b/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Recovery code\b/ })).toBeVisible();
  });

  test('REQ-FR5 PasskeySuggested · never asks for a code', async ({ page }) => {
    await openStory(page, 'passkey-suggested');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();
  });

  test('InsufficientSignInAgain · offers Sign in again beside Close', async ({ page }) => {
    await openStory(page, 'insufficient-sign-in-again');
    await expect(page.getByRole('button', { name: 'Sign in again', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  });

  test('RateLimited · names the wait and asks for no code', async ({ page }) => {
    await openStory(page, 'rate-limited');
    await expect(page.getByText('Too many attempts. Try again in 30 seconds.', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('NoUsableFactor · says why, offers no factor and no sign-in', async ({ page }) => {
    await openStory(page, 'no-usable-factor');
    await expect(
      page.getByText(
        "This account can't reach the security level this app asks for. Add a passkey on this device, or contact the app.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('[data-testid^="upgrade-dialog-factor-"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in again', exact: true })).toHaveCount(0);
  });

  test('REQ-FR5 ChallengeWrongCode · keeps the rejected-code prompt open', async ({ page }) => {
    await openStory(page, 'challenge-wrong-code');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
