import { test, expect } from './fixtures';

/**
 * Script Injection E2E Suite
 *
 * Validates that after a successful cold start, the extension can:
 * 1. Save a script via messaging
 * 2. Inject it into a test page via INJECT_SCRIPTS
 * 3. Observe the script's side-effect on the page DOM
 * 4. Confirm the injection result reports success
 * 5. Verify no console errors from the injected script
 */

test.describe('Script Injection', () => {

  test('injects a script that modifies the DOM on a test page', async ({ context, extensionId }) => {
    // 1. Wait for boot readiness
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await extPage.waitForLoadState('domcontentloaded');

    const pong = await extPage.evaluate(async () => {
      return new Promise<unknown>((resolve) => {
        const t = setTimeout(() => resolve(null), 5000);
        chrome.runtime.sendMessage({ type: '__PING__' }, (res) => {
          clearTimeout(t);
          resolve(res);
        });
      });
    });
    expect(pong).toBeTruthy();

    // 2. Open a blank test page to inject into
    const testPage = await context.newPage();
    await testPage.goto('about:blank');
    await testPage.waitForLoadState('domcontentloaded');

    // Get the tab ID of the test page
    const tabId = await extPage.evaluate(async () => {
      return new Promise<number | null>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(tabs.length > 0 ? tabs[0].id ?? null : null);
        });
      });
    });

    // We need the tabId of the about:blank page, query all tabs
    const allTabId = await extPage.evaluate(async () => {
      return new Promise<number | null>((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          const blankTab = tabs.find((t) => t.url === 'about:blank');
          resolve(blankTab?.id ?? null);
        });
      });
    });
    expect(allTabId).not.toBeNull();

    // 3. Inject a script that creates a DOM element
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-test-script-001',
                name: 'E2E Test Script',
                code: `
                  (function() {
                    var el = document.createElement('div');
                    el.id = 'marco-e2e-injected';
                    el.textContent = 'Marco was here';
                    el.style.cssText = 'position:fixed;top:0;left:0;background:lime;padding:8px;z-index:99999;';
                    document.body.appendChild(el);
                  })();
                `,
                order: 0,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, allTabId!);

    // 4. Verify the injection result indicates success
    const result = injectionResult as { results: Array<{ scriptId: string; isSuccess: boolean; errorMessage?: string }> };
    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0].isSuccess).toBe(true);
    expect(result.results[0].scriptId).toBe('e2e-test-script-001');

    // 5. Verify the DOM side-effect on the test page
    const injectedElement = testPage.locator('#marco-e2e-injected');
    await expect(injectedElement).toBeVisible({ timeout: 5000 });
    await expect(injectedElement).toHaveText('Marco was here');

    await extPage.close();
  });

  test('reports failure for a script with a syntax error', async ({ context, extensionId }) => {
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await extPage.waitForLoadState('domcontentloaded');

    // Wait for readiness
    await extPage.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 5000);
        chrome.runtime.sendMessage({ type: '__PING__' }, () => {
          clearTimeout(t);
          resolve();
        });
      });
    });

    // Open test page
    const testPage = await context.newPage();
    await testPage.goto('about:blank');
    await testPage.waitForLoadState('domcontentloaded');

    const blankTabId = await extPage.evaluate(async () => {
      return new Promise<number | null>((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          const t = tabs.find((tab) => tab.url === 'about:blank');
          resolve(t?.id ?? null);
        });
      });
    });
    expect(blankTabId).not.toBeNull();

    // Inject a script with intentional syntax error
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-bad-script-001',
                name: 'Bad Script',
                code: 'function(( { broken syntax here',
                order: 0,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, blankTabId!);

    // The result should indicate failure
    const result = injectionResult as { results: Array<{ scriptId: string; isSuccess: boolean; errorMessage?: string }> };
    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0].isSuccess).toBe(false);
    expect(result.results[0].errorMessage).toBeDefined();

    await extPage.close();
  });

  test('injected script does not leak console errors', async ({ context, extensionId }) => {
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await extPage.waitForLoadState('domcontentloaded');

    await extPage.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 5000);
        chrome.runtime.sendMessage({ type: '__PING__' }, () => {
          clearTimeout(t);
          resolve();
        });
      });
    });

    const testPage = await context.newPage();

    // Collect console errors on the test page
    const pageErrors: string[] = [];
    testPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        pageErrors.push(msg.text());
      }
    });
    testPage.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await testPage.goto('about:blank');
    await testPage.waitForLoadState('domcontentloaded');

    const tabId = await extPage.evaluate(async () => {
      return new Promise<number | null>((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          const t = tabs.find((tab) => tab.url === 'about:blank');
          resolve(t?.id ?? null);
        });
      });
    });

    // Inject a clean script
    await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-clean-script',
                name: 'Clean Script',
                code: `document.title = 'Marco E2E Clean';`,
                order: 0,
              },
            ],
          },
          () => resolve(),
        );
      });
    }, tabId!);

    // Wait a moment for any async errors
    await testPage.waitForTimeout(1000);

    // Verify title was changed
    const title = await testPage.title();
    expect(title).toBe('Marco E2E Clean');

    // No console errors from the injected script
    expect(pageErrors).toEqual([]);

    await extPage.close();
  });
});
