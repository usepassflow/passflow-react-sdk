import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/** The browser tests that run before a release only: the publish workflow runs them and a failure stops the release. */
export default defineConfig(baseConfig, {
  testIgnore: [],
  testMatch: '**/*.release.spec.ts',
});
