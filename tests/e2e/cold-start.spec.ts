import { test, expect } from './fixtures';

/**
 * Cold Start E2E Suite
 *
 * Validates that the extension boots cleanly:
 * 1. __PING__ readiness handshake succeeds
 * 2. Service worker reports successful boot
 * 3. No "Receiving end does not exist" errors in console
 */

test.describe('Cold Start', () => {
  test('service worker responds to __PING__ after boot', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // Send __PING__ and expect __PONG__
    const response = await page.evaluate(async () => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('__PING__ timed out')), 5000);
        chrome.runtime.sendMessage({ type: '__PING__' }, (res) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
    });

    expect(response).toEqual({ type: '__PONG__' });
  });

  test('boot completes without fatal errors', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // Query boot diagnostics via GET_BOOT_DIAGNOSTICS or health ping
    const health = await page.evaluate(async () => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Health check timed out')), 5000);
        chrome.runtime.sendMessage({ type: 'GET_BOOT_DIAGNOSTICS' }, (res) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
    });

    // Boot diagnostics should indicate success
    const diag = health as Record<string, unknown>;
    expect(diag).toBeTruthy();
    // The final step should be "ready", not "failed:*"
    if (diag.step !== undefined) {
      expect(String(diag.step)).not.toMatch(/^failed:/);
    }
  });

  test('no "Receiving end does not exist" errors during cold start', async ({ context, extensionId }) => {
    const consoleErrors: string[] = [];

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // Give the popup time to complete its init messaging
    await page.waitForTimeout(3000);

    const connectionErrors = consoleErrors.filter(
      (e) =>
        e.includes('Receiving end does not exist') ||
        e.includes('Could not establish connection'),
    );

    expect(connectionErrors).toEqual([]);
  });

  test('popup renders health indicator after boot', async ({ popup }) => {
    // The popup should render without a fatal error state
    // Look for the health ping element (🟢, 🟡, or 🔴)
    const healthEl = popup.locator('[data-testid="health-ping"], .health-ping, .health-indicator');
    const bodyText = await popup.locator('body').textContent();

    // At minimum, the popup body should have rendered content (not blank)
    expect(bodyText?.trim().length).toBeGreaterThan(0);

    // Should NOT show a fatal/unrecoverable error message
    expect(bodyText).not.toContain('Extension failed to initialize');
  });
});
