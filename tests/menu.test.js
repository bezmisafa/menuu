import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { validateMenu, safeImage, formatPrice, clone } from '../assets/model.js';
import { GitHubMenu, parseRepository, normalizeDirectory, decodeContent } from '../admin/github.js';

const menu = JSON.parse(await readFile(new URL('../data/menu.json', import.meta.url), 'utf8'));
test('All 120 products, 20 categories and existing translations survive migration', async () => {
  validateMenu(menu);
  assert.equal(menu.products.length, 120);
  assert.equal(menu.categories.length, 20);
  assert.deepEqual(menu.products[0].names, { tr: 'Çay', en: 'Tea', ar: 'شاي' });
  assert.equal(menu.products[0].price, 30);
  assert.equal(formatPrice(menu.products.find(p => p.names.tr === 'Sufle + Dondurma')), '350 TL + 50 TL');
  await Promise.all([...new Set([menu.settings.heroImage, ...menu.products.map(p => p.image)].filter(Boolean))].map(path => access(new URL('../' + path, import.meta.url))));
});
test('Invalid references, incomplete translations, duplicates, prices and unsafe image paths are rejected', () => {
  for (const mutate of [
    m => { m.products[0].categoryId = 'missing'; },
    m => { m.products[0].names.ar = ''; },
    m => { m.products[0].price = -1; },
    m => { m.products[0].extraPrice = Infinity; },
    m => { m.products.push(clone(m.products[0])); },
    m => { m.products[0].image = 'javascript:alert(1)'; },
    m => { m.settings.heroImage = 'uploads/../../private.png'; }
  ]) { const invalid = clone(menu); mutate(invalid); assert.throws(() => validateMenu(invalid)); }
  assert.equal(safeImage('data:image/svg+xml,<svg>'), '');
  assert.equal(safeImage('https://example.org/tea.webp'), 'https://example.org/tea.webp');
  assert.equal(formatPrice({ price: 45.5, extraPrice: null }), '45,5 TL');
});
test('GitHub configuration and UTF-8 decoding handle the supported static hosting paths', () => {
  assert.equal(parseRepository('https://github.com/bezmisafa/menuu.git'), 'bezmisafa/menuu');
  assert.equal(normalizeDirectory('/docs/'), 'docs');
  assert.throws(() => parseRepository('https://malicious.example/owner/repo'));
  assert.throws(() => normalizeDirectory('../docs'));
  assert.equal(decodeContent(Buffer.from('Çay · شاي').toString('base64')), 'Çay · شاي');
});

function githubMock({ stale = false, race = false, uploadFails = false, lostResponse = false, unrelatedCommit = false } = {}) {
  const calls = [];
  let reference = 'head-a', newMenu;
  const fetcher = async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/repos/bezmisafa/menuu'));
    assert.equal(options.headers.Authorization, 'Bearer fake-test-token');
    const path = url.replace('https://api.github.com/repos/bezmisafa/menuu', '');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, body });
    const ok = value => new Response(JSON.stringify(value), { status: 200 });
    if (path === '') return ok({ default_branch: 'main' });
    if (path.startsWith('/git/ref/heads/')) return ok({ object: { sha: unrelatedCommit ? 'head-b' : reference } });
    if (path.startsWith('/contents/')) return ok({ sha: path.includes('next-commit') ? 'menu-new' : stale && calls.length > 3 ? 'menu-other' : 'menu-old', content: Buffer.from(JSON.stringify(newMenu || menu)).toString('base64') });
    if (path.startsWith('/git/commits/')) return ok({ tree: { sha: 'base-tree' } });
    if (path === '/git/blobs') return uploadFails ? new Response('{}', { status: 403 }) : ok({ sha: 'image-blob' });
    if (path === '/git/trees') { newMenu = JSON.parse(body.tree.find(x => x.path.endsWith('data/menu.json')).content); return ok({ sha: 'next-tree' }); }
    if (path === '/git/commits') return ok({ sha: 'next-commit' });
    if (path.startsWith('/git/refs/heads/')) {
      if (race) return new Response('{}', { status: 422 });
      reference = body.sha;
      if (lostResponse) throw Error('Response lost after update');
      return ok({ object: { sha: reference } });
    }
    throw Error('Unexpected request: ' + path);
  };
  return { calls, fetcher };
}
function client(mock, directory = '') { return new GitHubMenu({ repository: 'bezmisafa/menuu', token: 'fake-test-token', directory, fetcher: mock.fetcher }); }
const image = { base64: 'aW1hZ2U=', mime: 'image/webp' };
test('Browser fetch is called without an incompatible class receiver', async () => {
  let called = false;
  const github = new GitHubMenu({ repository: 'bezmisafa/menuu', token: 'fake-test-token', fetcher: function () {
    assert.equal(this, undefined);
    called = true;
    return Promise.resolve(new Response('{}', { status: 401 }));
  } });
  await assert.rejects(github.connect(), /anahtarı geçersiz/);
  assert.equal(called, true);
});
test('Menu and used uploads are committed atomically; other files are preserved', async () => {
  const mock = githubMock(), github = client(mock, 'docs');
  const draft = await github.connect(); draft.products[0].price = 45.5; draft.products[0].image = 'uploads/test.webp';
  const result = await github.publish(draft, new Map([['uploads/test.webp', image], ['uploads/unused.webp', image]]));
  assert.equal(result.sha, 'next-commit');
  assert.equal(github.menuSha, 'menu-new');
  assert.equal(mock.calls.filter(c => c.path === '/git/blobs').length, 1);
  const tree = mock.calls.find(c => c.path === '/git/trees').body;
  assert.equal(tree.base_tree, 'base-tree');
  assert.deepEqual(tree.tree.map(t => t.path), ['docs/data/menu.json', 'docs/uploads/test.webp']);
  assert.equal(JSON.parse(tree.tree[0].content).products[0].names.ar, 'شاي');
  const commit = mock.calls.find(c => c.path === '/git/commits').body;
  assert.deepEqual(commit.parents, ['head-a']);
  assert.deepEqual(mock.calls.at(-1).body, { sha: 'next-commit', force: false });
});
test('Another editor changing the menu prevents all writes', async () => {
  const mock = githubMock({ stale: true }), github = client(mock);
  await github.connect();
  await assert.rejects(github.publish(menu), /başka bir oturumdan/);
  assert.equal(mock.calls.filter(c => c.method !== 'GET').length, 0);
});
test('A failing image upload never changes the published branch', async () => {
  const mock = githubMock({ uploadFails: true }), github = client(mock);
  const draft = await github.connect(); draft.products[0].image = 'uploads/test.webp';
  await assert.rejects(github.publish(draft, new Map([['uploads/test.webp', image]])), /reddetti/);
  assert.equal(mock.calls.filter(c => c.method === 'PATCH').length, 0);
  assert.equal(github.menuSha, 'menu-old');
});
test('Concurrent branch update is never force-pushed over', async () => {
  const mock = githubMock({ race: true }), github = client(mock);
  await github.connect();
  await assert.rejects(github.publish(menu), /kabul etmedi/);
  assert.equal(mock.calls.find(c => c.method === 'PATCH').body.force, false);
  assert.equal(github.menuSha, 'menu-old');
});
test('A lost success response is reconciled against the actual branch', async () => {
  const mock = githubMock({ lostResponse: true }), github = client(mock);
  await github.connect();
  const result = await github.publish(menu);
  assert.equal(result.sha, 'next-commit');
  assert.equal(github.menuSha, 'menu-new');
});
test('Changes to unrelated files can be preserved without a false menu conflict', async () => {
  const mock = githubMock({ unrelatedCommit: true }), github = client(mock);
  await github.connect(); await github.publish(menu);
  assert.deepEqual(mock.calls.find(c => c.path === '/git/commits').body.parents, ['head-b']);
});
