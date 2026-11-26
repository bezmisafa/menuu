import { label, formatPrice, safeImage, validateMenu } from './model.js';

const lang = document.documentElement.lang;
const messages = {
  tr: { all: '🏠 TÜMÜ', empty: 'Henüz ürün bulunmuyor.', error: 'Menü yüklenemedi. Lütfen tekrar deneyin.', retry: 'Tekrar dene', preview: 'Taslak önizlemesi · Henüz yayınlanmadı' },
  en: { all: '🏠 ALL', empty: 'No products available yet.', error: 'The menu could not be loaded. Please try again.', retry: 'Try again', preview: 'Draft preview · Not published yet' },
  ar: { all: '🏠 الكل', empty: 'لا توجد منتجات حالياً.', error: 'تعذر تحميل القائمة. يرجى المحاولة مرة أخرى.', retry: 'إعادة المحاولة', preview: 'معاينة المسودة · لم يتم النشر بعد' }
}[lang] || {};
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function renderMenu(menu, imagePreviews = {}) {
  validateMenu(menu);
  document.querySelector('.title').textContent = label(menu.settings.titles, lang);
  const hero = document.querySelector('.hero-section');
  const heroImage = hero.querySelector('img');
  hero.hidden = !menu.settings.heroImage;
  heroImage.src = imagePreviews[menu.settings.heroImage] || safeImage(menu.settings.heroImage);
  heroImage.onerror = () => { hero.hidden = true; };
  const nav = document.querySelector('.categories-container');
  const main = document.querySelector('.menu-section');
  nav.replaceChildren();
  main.replaceChildren();
  const sections = [];
  function addButton(id, text) {
    const button = element('button', `category-btn${id === 'all' ? ' active' : ''}`, text);
    button.type = 'button';
    button.dataset.category = id;
    button.setAttribute('aria-pressed', String(id === 'all'));
    button.addEventListener('click', () => {
      for (const other of nav.children) {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      }
      for (const section of sections) section.hidden = id !== 'all' && section.dataset.category !== id;
      main.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    nav.append(button);
  }
  addButton('all', messages.all);
  for (const category of menu.categories) {
    const products = menu.products.filter(p => p.categoryId === category.id && p.visible);
    if (!category.visible || !products.length) continue;
    addButton(category.id, `${category.icon} ${label(category.names, lang)}`);
    const section = element('section', 'category-section');
    section.dataset.category = category.id;
    section.append(element('h2', 'section-title', label(category.names, lang)));
    const items = element('div', 'menu-items');
    for (const product of products) {
      const item = element('article', 'menu-item');
      const icon = element('div', 'item-icon', product.icon || category.icon);
      const src = imagePreviews[product.image] || safeImage(product.image);
      if (src) {
        const image = element('img');
        image.src = src;
        image.alt = label(product.names, lang);
        image.loading = 'lazy';
        image.width = image.height = 80;
        image.onerror = () => image.remove();
        icon.replaceChildren(image);
      }
      const info = element('div', 'item-info');
      info.append(element('h3', 'item-name', label(product.names, lang)));
      if (label(product.descriptions, lang)) info.append(element('p', 'item-description', label(product.descriptions, lang)));
      const price = element('p', 'item-price', formatPrice(product));
      price.dir = 'ltr';
      info.append(price);
      item.append(icon, info);
      items.append(item);
    }
    section.append(items);
    main.append(section);
    sections.push(section);
  }
  if (!sections.length) main.append(element('p', 'menu-status', messages.empty));
}

const preview = new URLSearchParams(location.search).has('preview') && window.parent !== window;
if (preview) {
  document.body.prepend(element('p', 'preview-banner', messages.preview));
  document.querySelectorAll('.language-switch a').forEach(a => a.hidden = true);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'menu-preview') return;
    try { renderMenu(event.data.menu, event.data.images); } catch { /* Parent shows validation errors. */ }
  });
} else {
  async function load() {
    try {
      const response = await fetch('data/menu.json', { cache: 'no-store' });
      if (!response.ok) throw Error('Menu fetch failed');
      renderMenu(await response.json());
    } catch {
      const main = document.querySelector('.menu-section');
      const retry = element('button', 'category-btn', messages.retry);
      retry.addEventListener('click', load);
      main.replaceChildren(element('p', 'menu-status', messages.error), retry);
    }
  }
  load();
}
