import type { Page, Locator } from '@playwright/test';
import { z } from 'zod';
import { expect } from './fixtures';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function openSettings(page: Page, category: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await dialog.getByRole('button', { name: category, exact: true }).click();
  return dialog;
}

export async function openDesktopMenu(page: Page) {
  const workspace = page.getByTestId('desktop');
  const bounds = await workspace.boundingBox();
  if (!bounds) throw new Error('The desktop must be visible.');
  await workspace.click({
    button: 'right',
    position: { x: bounds.width - 12, y: bounds.height - 12 },
  });
}

export async function failNextWrite(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let pending = true;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<typeof original>
    ) {
      if (pending && args[1] === 'readwrite') {
        pending = false;
        throw new DOMException('E2E injected write failure', 'QuotaExceededError');
      }
      return Reflect.apply(original, this, args);
    };
  });
}

export async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
  });
}
export async function noHorizontalOverflow(element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

/** Read the supported backup output, without depending on IndexedDB stores or records. */
export async function exportNormalBackup(page: Page) {
  const settings = await openSettings(page, '数据与备份');
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await settings.getByRole('combobox', { name: '导出范围', exact: true }).click();
  await page.getByRole('option', { name: '普通空间', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  if (!stream) throw new Error('The backup download must be readable.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = parseNormalBackup(Buffer.concat(chunks).toString('utf8'));
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  return backup;
}

export function parseNormalBackup(text: string) {
  const document = z
    .object({
      format: z.literal('raytab-backup'),
      spaces: z.object({
        normal: z.object({
          data: z.object({
            sites: z.array(
              z.object({
                title: z.string(),
                url: z.string(),
                icon: z.object({ source: z.string(), resourceId: z.string().optional() }),
                iconBackground: z.object({ mode: z.string() }),
              }),
            ),
          }),
          resources: z.array(z.object({ id: z.string(), type: z.string(), data: z.string() })),
        }),
      }),
    })
    .parse(JSON.parse(text));
  return document.spaces.normal;
}

export async function readSiteImage(page: Page, title: string) {
  const backup = await exportNormalBackup(page);
  const site = backup.data.sites.find((item) => item.title === title);
  const id = site && 'resourceId' in site.icon ? site.icon.resourceId : undefined;
  const resource = backup.resources.find((item) => item.id === id);
  if (!resource) throw new Error(`The backup must include the displayed image for ${title}`);
  return { type: resource.type, text: Buffer.from(resource.data, 'base64').toString('utf8') };
}
