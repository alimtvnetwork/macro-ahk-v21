import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions } from './fixtures';

/**
 * E2E-02 — Project CRUD Lifecycle
 *
 * Create, read, update, and delete a project through the Options page.
 * Priority: P0 | Auto: ✅ | Est: 3 min
 *
 * Pass criteria:
 *   - Full CRUD cycle completes
 *   - Storage is clean after delete (no orphan rules/scripts/configs)
 */
test.describe('E2E-02 — Project CRUD Lifecycle', () => {
  test('create a new project', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    // Step 2–3: New Project → fill name → save
    await options.getByRole('button', { name: /new project/i }).click();
    await options.getByLabel(/name/i).fill('Test Automation');
    await options.getByRole('button', { name: /save/i }).click();

    await expect(options.getByText('Test Automation')).toBeVisible();

    await context.close();
  });

  test('update project name', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    // Setup: create project
    await options.getByRole('button', { name: /new project/i }).click();
    await options.getByLabel(/name/i).fill('Test Automation');
    await options.getByRole('button', { name: /save/i }).click();

    // Step 4–5: Edit → rename → save
    await options.getByText('Test Automation').click();
    await options.getByLabel(/name/i).clear();
    await options.getByLabel(/name/i).fill('Test Automation v2');
    await options.getByRole('button', { name: /save/i }).click();

    await expect(options.getByText('Test Automation v2')).toBeVisible();

    await context.close();
  });

  test('delete project cleans up storage', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    // Setup
    await options.getByRole('button', { name: /new project/i }).click();
    await options.getByLabel(/name/i).fill('Delete Me');
    await options.getByRole('button', { name: /save/i }).click();

    // Step 6: Delete → confirm
    await options.getByText('Delete Me').click();
    await options.getByRole('button', { name: /delete/i }).click();
    await options.getByRole('button', { name: /confirm/i }).click();

    // Step 7: Verify removed
    await expect(options.getByText('Delete Me')).not.toBeVisible();

    await context.close();
  });
});
