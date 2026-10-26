import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { E2E_DATA_DIR, E2E_TOKEN } from '../playwright.config';

// The terminal renders to a canvas, so these tests observe behaviour through the UI the user
// relies on: tabs, status dots (aria-labels), and the exit banner.

function makeProjectFolder(name: string) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-e2e-proj-')), name);
  fs.mkdirSync(dir);
  return dir;
}

// The project row's accessible name is "<name> <path>"; the icon buttons are "Hapus <name>" etc.
const projectRow = (page: Page, folder: string) =>
  page.getByRole('button', { name: new RegExp(`^${path.basename(folder)}\\s`) });

async function addProject(page: Page, folder: string) {
  await page.getByRole('button', { name: 'Tambah project', exact: true }).click();
  await page.getByLabel('Path folder').fill(folder);
  await page.getByRole('button', { name: 'Tambah', exact: true }).click();
  await expect(projectRow(page, folder)).toBeVisible();
}

async function openFakeCli(page: Page, folder: string) {
  await page
    .getByRole('button', { name: new RegExp(path.basename(folder)) })
    .first()
    .click();
  await page
    .getByRole('group', { name: 'Pilih CLI' })
    .getByRole('button', { name: 'Fake CLI' })
    .click();
}

async function typeInActiveTerminal(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const activeTab = (page: Page) => page.getByRole('tab', { selected: true });

test.beforeEach(async ({ page }) => {
  await page.goto(`/?token=${E2E_TOKEN}`);
  await expect(page).toHaveURL(/\/$/); // token moved out of the URL
});

test('add project, run a CLI, see status, survive a refresh, and close', async ({ page }) => {
  const folder = makeProjectFolder('e2e-main');
  await addProject(page, folder);
  await openFakeCli(page, folder);

  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(activeTab(page).getByRole('img', { name: 'Siap' })).toBeVisible({ timeout: 15_000 });

  await typeInActiveTerminal(page, 'ask');
  await expect(activeTab(page).getByRole('img', { name: 'Menunggu input' })).toBeVisible();
  await expect(page).toHaveTitle(/\(1\) menunggu/);

  const started = Date.now();
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(activeTab(page).getByRole('img', { name: 'Menunggu input' })).toBeVisible();
  const restoreMs = Date.now() - started;
  console.log(`restore after reload: ${restoreMs} ms`);

  // Input still reaches the same process after the reload.
  await page.locator('.xterm').first().click();
  await typeInActiveTerminal(page, 'y');
  await expect(activeTab(page).getByRole('img', { name: 'Siap' })).toBeVisible({ timeout: 10_000 });

  await activeTab(page)
    .locator('..')
    .getByRole('button', { name: /^Tutup/ })
    .click();
  await page.getByRole('button', { name: 'Hentikan & tutup' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText('Belum ada sesi terbuka')).toBeVisible();
});

test('five sessions run in parallel without mixing input', async ({ page }) => {
  const folder = makeProjectFolder('e2e-parallel');
  await addProject(page, folder);

  for (let i = 0; i < 5; i++) {
    await openFakeCli(page, folder);
    await expect(page.getByRole('tab')).toHaveCount(i + 1);
  }
  const tabs = page.getByRole('tab');
  for (let i = 0; i < 5; i++) {
    await expect(tabs.nth(i).getByRole('img', { name: 'Siap' })).toBeVisible({ timeout: 15_000 });
  }

  // Each tab exits with its own code; the banner proves the keystrokes reached that process.
  for (let i = 0; i < 5; i++) {
    await tabs.nth(i).click();
    await typeInActiveTerminal(page, `exit ${i + 1}`);
    await expect(page.getByRole('status').filter({ hasText: `kode ${i + 1}` })).toBeVisible();
  }

  for (let i = 0; i < 5; i++) {
    await tabs.nth(0).click();
    await page.getByRole('status').getByRole('button', { name: 'Tutup' }).click();
  }
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('a CLI added to clis.json shows up without restarting', async ({ page }) => {
  const folder = makeProjectFolder('e2e-config');
  await addProject(page, folder);

  const file = path.join(E2E_DATA_DIR, 'clis.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as { clis: object[] };
  config.clis.push({ id: 'echo-cli', name: 'Echo CLI', command: 'cmd.exe', color: '#4285F4' });
  fs.writeFileSync(file, JSON.stringify(config));

  const picker = page.getByRole('group', { name: 'Pilih CLI' });
  await expect(async () => {
    // Re-open the picker until the server has reloaded the file.
    if (await picker.isVisible()) await projectRow(page, folder).click();
    await projectRow(page, folder).click();
    await expect(picker.getByRole('button', { name: 'Echo CLI' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
});

test('rejects the API without the token', async ({ request }) => {
  const res = await request.get('/api/sessions');
  expect(res.status()).toBe(401);
});
