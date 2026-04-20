import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openPopup, openOptions } from './fixtures';

/**
 * E2E-01 — First-Run Onboarding
 *
 * Verify the welcome page appears on first install and a default project is created.
 * Priority: P0 | Auto: ✅ | Est: 2 min
 *
 * Pass criteria:
 *   - Welcome page renders without errors
 *   - Default project persists after popup close
 */
test.describe('E2E-01 — First-Run Onboarding', () => {
  test('welcome page displays on fresh install', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const popup = await openPopup(context, extensionId);

    // Step 2: Welcome page with logo, version, and "Get Started" CTA
    await expect(popup.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(popup.getByRole('button', { name: /get started/i })).toBeVisible();

    await context.close();
  });

  test('"Get Started" creates default project', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const popup = await openPopup(context, extensionId);

    // Step 3: Click Get Started
    await popup.getByRole('button', { name: /get started/i }).click();

    // Step 4: Verify default project in Options page
    const options = await openOptions(context, extensionId);
    await expect(options.getByText('My First Project')).toBeVisible();

    await context.close();
  });

  test('onboarding_complete flag persisted in storage', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const popup = await openPopup(context, extensionId);
    await popup.getByRole('button', { name: /get started/i }).click();

    // Step 5: Verify chrome.storage.local
    const options = await openOptions(context, extensionId);
    const flag = await options.evaluate(async () => {
      return new Promise(resolve =>
        chrome.storage.local.get('onboarding_complete', d => resolve(d.onboarding_complete))
      );
    });
    expect(flag).toBe(true);

    await context.close();
  });
});
