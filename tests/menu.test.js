import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { validateMenu, safeImage, formatPrice, clone } from '../assets/model.js';

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
