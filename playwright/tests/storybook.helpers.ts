import { expect, type Page } from '@playwright/test';

/** Resolves once Storybook has finished rendering the selected story, or failed to. */
export async function waitForStoryRendered(page: Page) {
  await page.waitForFunction(() => {
    const phase = (window as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } }).__STORYBOOK_PREVIEW__
      ?.currentRender?.phase;
    return phase !== undefined && ['completed', 'afterEach', 'finished', 'errored', 'aborted'].includes(phase);
  });
  await expect(page.locator('body')).not.toHaveClass(/sb-show-errordisplay/);
}
