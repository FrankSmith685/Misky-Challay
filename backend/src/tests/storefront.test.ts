import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { createApp } from '../app';
import { sequelize } from '@database/connection';
import { User } from '@database/models';
import { StorefrontSetting } from '@database/models/storefrontSetting.model';
import { signAccessToken } from '@shared/utils/jwt';
import { revokeSessionCache } from '@middlewares/auth.middleware';
import {
  defaultStorefront,
  storefrontSchema,
  storefrontUpdateSchema,
} from '../modules/settings/storefront.schema';
import { storefrontService } from '../modules/settings/storefront.service';
import { buildStorefrontSitemap } from '../modules/settings/storefront.seo';

afterEach(() => {
  mock.restoreAll();
  revokeSessionCache(987654);
});

test('editorial validation rejects unsafe links, repeated sections and empty accessible descriptions', () => {
  const cases = [
    (value: ReturnType<typeof defaultStorefront>) => {
      value.hero.imageUrl = 'javascript:alert(1)';
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.hero.imageUrl = '/images/../secret.png';
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.hero.imageUrl = 'https://user:password@example.test/image.png';
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.sections[1].id = value.sections[0].id;
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.walkthrough[0].imageAlt = '';
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.guide.videoUrl = 'data:text/html,<h1>x</h1>';
    },
    (value: ReturnType<typeof defaultStorefront>) => {
      value.faqs[1].id = value.faqs[0].id;
    },
  ];
  for (const mutate of cases) {
    const content = defaultStorefront();
    mutate(content);
    assert.equal(storefrontSchema.safeParse(content).success, false);
  }
  assert.equal(
    storefrontUpdateSchema.safeParse({ body: { content: defaultStorefront(), version: -1 } })
      .success,
    false,
  );
  const valid = defaultStorefront();
  valid.hero.imageUrl = '/api/v1/media/files/home.webp';
  valid.sections.reverse();
  valid.sections[0].enabled = false;
  assert.equal(storefrontSchema.safeParse(valid).success, true);
});

test('public content exposes only the document and its version', async () => {
  mock.method(StorefrontSetting, 'findByPk', async () =>
    StorefrontSetting.build({
      id: 1,
      contentJson: defaultStorefront(),
      version: 3,
      updatedBy: 812,
      updatedAt: new Date('2026-11-01T12:00:00Z'),
    }),
  );
  const result = await storefrontService.get();
  assert.deepEqual(Object.keys(result).sort(), ['content', 'updatedAt', 'version']);
  assert.equal(result.version, 3);
  assert.equal(result.content.faqs.length, 6);
});

test('a concurrent edit cannot overwrite a newer document', async () => {
  const row = StorefrontSetting.build({ id: 1, contentJson: defaultStorefront(), version: 4 });
  const write = mock.method(row, 'update', async () => row);
  mock.method(StorefrontSetting, 'findByPk', async () => row);
  mock.method(
    sequelize,
    'transaction',
    async (fn: (transaction: Transaction) => Promise<unknown>) =>
      fn({ LOCK: { UPDATE: 'UPDATE' } } as Transaction),
  );
  await assert.rejects(
    storefrontService.update(defaultStorefront(), 3, 8),
    (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 409,
  );
  assert.equal(write.mock.callCount(), 0);
});

test('publishing increments the version and retains before/after for auditing', async () => {
  const row = StorefrontSetting.build({
    id: 1,
    contentJson: defaultStorefront(),
    version: 4,
    updatedAt: new Date('2026-11-01T12:00:00Z'),
  });
  mock.method(row, 'update', async (values: Partial<StorefrontSetting>) => {
    row.set(values);
    return row;
  });
  mock.method(StorefrontSetting, 'findByPk', async () => row);
  mock.method(
    sequelize,
    'transaction',
    async (fn: (transaction: Transaction) => Promise<unknown>) =>
      fn({ LOCK: { UPDATE: 'UPDATE' } } as Transaction),
  );
  const content = defaultStorefront();
  content.hero.title = 'Una portada actualizada';
  const result = await storefrontService.update(content, 4, 8);
  assert.equal(result.before.version, 4);
  assert.equal(result.before.content.hero.title, defaultStorefront().hero.title);
  assert.equal(result.after.version, 5);
  assert.equal(result.after.content.hero.title, 'Una portada actualizada');
  assert.equal(row.updatedBy, 8);
});

test('sitemap uses published product URLs, escapes XML and excludes account/payment routes', () => {
  const xml = buildStorefrontSitemap('https://pasteleria.example.test', [
    { slug: 'torta-vainilla', family: 'CAKE' },
    { slug: 'postre & crema', family: 'DESSERT' },
  ]);
  assert.match(xml, /https:\/\/pasteleria.example.test\/como-hacer-tu-pedido/);
  assert.match(xml, /\/tortas\/torta-vainilla/);
  assert.match(xml, /\/menu\/postre%20%26%20crema/);
  assert.doesNotMatch(xml, /\/admin|\/cuenta|\/checkout|\/experiencias\//);
});

test('public GET works without login; anonymous and customer writes are rejected', async () => {
  mock.method(StorefrontSetting, 'findByPk', async () => null);
  mock.method(User, 'findByPk', async () =>
    User.build({ id: 987654, status: 'ACTIVE', tokenVersion: 0, isSuperAdmin: false }),
  );
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.once('listening', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/v1/settings/storefront`;
    const get = await fetch(url);
    assert.equal(get.status, 200);
    assert.equal(((await get.json()) as { data: { version: number } }).data.version, 0);
    const body = JSON.stringify({ content: defaultStorefront(), version: 0 });
    const anonymous = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(anonymous.status, 401);
    const token = signAccessToken({
      sub: 987654,
      email: 'editor@example.test',
      roles: ['CUSTOMER'],
      permissions: [],
      branchIds: [],
      isSuperAdmin: false,
      tv: 0,
    });
    const customer = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
    assert.equal(customer.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
