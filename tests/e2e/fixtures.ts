import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';

/*
 * Chrome Extension E2E — Shared Fixtures
 *
 * Provides both standalone helpers and a custom `test` fixture
 * that auto-launches the extension context for each test.
 *
 * Usage in test files:
 *   import { test, expect } from './fixtures';
 *   test('my test', async ({ context, extensionId, popup, options }) => { ... });
 *
 * Ref: spec/05-chrome-extension/testing/01-e2e-test-specification.md
 */

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

// ─── Standalone Helpers ──────────────────────────────────────────────

/** Launch a persistent context with the extension loaded. */
export async function launchExtension(
  browserType: typeof chromium = chromium
): Promise<BrowserContext> {
  return browserType.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
    ],
  });
}

/** Resolve the extension's internal ID from the service worker. */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const url = sw.url();
  const match = url.match(/chrome-extension:\/\/([^/]+)/);
  if (!match) throw new Error('Could not resolve extension ID from service worker URL');
  return match[1];
}

/** Open the extension popup page. */
export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

/** Open the extension options page. */
export async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForLoadState('domcontentloaded');
  return options;
}

// ─── Custom Test Fixture ─────────────────────────────────────────────

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
  options: Page;
};

/**
 * Extended `test` object that provides auto-managed extension fixtures.
 *
 * - `context`     — persistent browser context with extension loaded
 * - `extensionId` — resolved chrome-extension:// ID
 * - `popup`       — page navigated to popup.html
 * - `options`     — page navigated to options.html (lazy, only created on use)
 */
export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const ctx = await launchExtension();
    await use(ctx);
    await ctx.close();
  },

  extensionId: async ({ context }, use) => {
    const id = await getExtensionId(context);
    await use(id);
  },

  popup: async ({ context, extensionId }, use) => {
    const page = await openPopup(context, extensionId);
    await use(page);
  },

  options: async ({ context, extensionId }, use) => {
    const page = await openOptions(context, extensionId);
    await use(page);
  },
});

export { expect } from '@playwright/test';
