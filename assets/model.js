export const LANGUAGES = ['tr', 'en', 'ar'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const label = (value, lang) => value?.[lang] || value?.tr || '';
export function formatPrice(product) {
  const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
  return `${number.format(product.price)} TL${product.extraPrice == null ? '' : ` + ${number.format(product.extraPrice)} TL`}`;
}
export function safeImage(path) {
  if (typeof path !== 'string' || !path) return '';
  if (/^https:\/\//i.test(path)) return path;
  if (/^(resimler|uploads)\//.test(path) && !/[\\\x00-\x1f?#]/.test(path) && !path.split('/').includes('..')) return path;
  return '';
}
export function validateMenu(menu) {
  if (!menu || menu.version !== 1 || !Array.isArray(menu.categories) || !Array.isArray(menu.products)) throw Error('Geçerli bir menü dosyası seçin.');
  if (menu.categories.length > 200 || menu.products.length > 3000) throw Error('Menü boyutu sınırı aşıldı.');
  const text = (s, max = 200) => typeof s === 'string' && s.length <= max;
  const translations = (obj, required, max) => LANGUAGES.every(l => text(obj?.[l], max) && (!required || obj[l].trim().length));
  if (!translations(menu.settings?.titles, true, 200) || !text(menu.settings.heroImage, 1000) || (menu.settings.heroImage && !safeImage(menu.settings.heroImage))) throw Error('Site başlıklarını ve kapak görselini kontrol edin.');
  const ids = new Set();
  for (const c of menu.categories) {
    if (!/^[a-z0-9-]{1,100}$/.test(c.id) || ids.has(c.id) || !translations(c.names, true, 200) || !text(c.icon, 20) || typeof c.visible !== 'boolean') throw Error('Kategori bilgilerini ve üç dildeki adlarını kontrol edin.');
    ids.add(c.id);
  }
  const products = new Set();
  for (const p of menu.products) {
    if (!/^[a-z0-9-]{1,100}$/.test(p.id) || products.has(p.id) || !ids.has(p.categoryId) || !translations(p.names, true, 200) || !translations(p.descriptions, false, 2000) || !Number.isFinite(p.price) || p.price < 0 || p.price > 1000000 || (p.extraPrice != null && (!Number.isFinite(p.extraPrice) || p.extraPrice < 0 || p.extraPrice > 1000000)) || !text(p.image, 1000) || (p.image && !safeImage(p.image)) || !text(p.icon, 20) || typeof p.visible !== 'boolean') throw Error('Ürün bilgilerini, fiyatlarını ve üç dildeki adlarını kontrol edin.');
    products.add(p.id);
  }
  return menu;
}
