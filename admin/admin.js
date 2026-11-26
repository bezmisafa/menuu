import { LANGUAGES, clone, label, formatPrice, safeImage, validateMenu } from '../assets/model.js';
import { GitHubMenu } from './github.js';

const $ = selector => document.querySelector(selector);
const fields = form => form.elements;
const productForm = $('#product-form');
const categoryForm = $('#category-form');
const settingsForm = $('#settings-form');
const languageNames = { tr: 'Türkçe', en: 'English', ar: 'العربية' };
let menu, baseline = '', connection = null, config = {}, dirty = false, busy = false, view = 'products';
let pendingImages = new Map(), workingImage = null, heroImage = null, saveTimer;
let activeUpload = 0;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}
function button(text, className, action, title) {
  const element = node('button', className, text);
  element.type = 'button';
  if (title) { element.title = title; element.setAttribute('aria-label', title); }
  element.addEventListener('click', action);
  return element;
}
function notify(message, error = false, link) {
  const notice = $('#notice');
  notice.classList.toggle('error', error);
  notice.replaceChildren(document.createTextNode(message));
  if (link) {
    const a = node('a', '', 'GitHub’da kaydı gör');
    a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    notice.append(a);
  }
}
function askConfirm(message) {
  const dialog = $('#confirm-dialog');
  $('#confirm-message').textContent = message;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirmed'), { once: true });
    dialog.showModal();
    $('#confirm-cancel').focus();
  });
}
$('#confirm-cancel').addEventListener('click', () => $('#confirm-dialog').close('cancelled'));
$('#confirm-accept').addEventListener('click', () => $('#confirm-dialog').close('confirmed'));
function updateState() {
  $('#draft-status').textContent = busy ? 'İşlem sürüyor…' : dirty ? 'Yayınlanmamış değişiklikler var' : 'Tüm değişiklikler kayıtlı';
  $('#publish-button').disabled = busy || !dirty || !connection;
  $('#preview-button').disabled = busy || !menu;
  $('#new-button').disabled = busy || !menu || (view === 'products' && !menu.categories.length);
  $('#connect-button').disabled = busy;
  $('#logout-button').disabled = busy;
  $('#connection-status').textContent = connection ? `${connection.repository} · ${connection.branch}` : 'Yerel taslak · GitHub bağlantısı yok';
  $('#connect-button').textContent = connection ? 'Bağlantı ayarları' : 'GitHub’a bağlan';
  $('#logout-button').hidden = !connection;
  // Lock menu mutations during a publication so no edits can be lost mid-save.
  document.querySelectorAll('#product-rows button, #category-cards button, #settings-view button, #settings-view input, #settings-view textarea, #search, #category-filter, #visibility-filter').forEach(control => { control.disabled = busy; });
  if (!busy) renderOrderAvailability();
}

// Drafts and pending photos stay on this device; credentials never enter storage.
const database = new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) { reject(Error('No draft storage')); return; }
  const request = indexedDB.open('bezmi-safa-menu-admin', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
database.catch(() => {});
async function draftStore(mode, callback) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = callback(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function saveDraft() {
  if (!dirty || !menu) return;
  try {
    await draftStore('readwrite', store => store.put({ menu: clone(menu), baseline, images: [...pendingImages], repository: config.repository, branch: config.branch, directory: config.directory }, 'current'));
  } catch {
    notify('Taslak bu tarayıcıda saklanamadı. Sekmeyi kapatmadan önce Ayarlar bölümünden yedeği indirin.', true);
  }
}
function markDirty(message = 'Değişiklik taslağa uygulandı. Siteye yansıtmak için yayımlayın.') {
  dirty = JSON.stringify(menu) !== baseline || pendingImages.size > 0;
  updateState();
  notify(message);
  clearTimeout(saveTimer);
  if (dirty) saveTimer = setTimeout(saveDraft, 150);
  else draftStore('readwrite', s => s.delete('current')).catch(() => {});
}

function translations(container, prefix, descriptions = false) {
  for (const lang of LANGUAGES) {
    const block = node('fieldset', 'translation-block');
    block.append(node('legend', '', languageNames[lang]));
    const nameLabel = node('label', '', descriptions ? 'Ürün adı' : 'Ad');
    const input = node('input'); input.name = `${prefix}-${lang}`; input.lang = lang; input.dir = lang === 'ar' ? 'rtl' : 'ltr'; input.required = true; input.maxLength = 200;
    nameLabel.append(input); block.append(nameLabel);
    if (descriptions) {
      const descLabel = node('label', '', 'Açıklama (isteğe bağlı)');
      const textarea = node('textarea'); textarea.name = `description-${lang}`; textarea.lang = lang; textarea.dir = lang === 'ar' ? 'rtl' : 'ltr'; textarea.maxLength = 2000;
      descLabel.append(textarea); block.append(descLabel);
    }
    container.append(block);
  }
}
translations($('#product-translations'), 'name', true);
translations($('#category-translations'), 'name');
translations($('#title-fields'), 'title');

function sourceFor(path, image = null) {
  const draft = image?.path === path ? image : pendingImages.get(path);
  if (draft) return `data:${draft.mime};base64,${draft.base64}`;
  const safe = safeImage(path);
  if (!safe) return '';
  // Local preview uses the exact checked-out assets. Once connected, raw URLs
  // also show photos published in this session before Pages finishes rebuilding.
  if (/^https:\/\//i.test(safe)) return safe;
  if (connection) return `https://raw.githubusercontent.com/${connection.repository}/${connection.branch.split('/').map(encodeURIComponent).join('/')}/${connection.path(safe).split('/').map(encodeURIComponent).join('/')}`;
  return `../${safe}`;
}
function thumbnail(path, icon = '☕', className = 'product-thumb', image = null) {
  const wrapper = node('div', className, icon);
  const src = sourceFor(path, image);
  if (src) {
    const img = node('img'); img.src = src; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => wrapper.replaceChildren(document.createTextNode(icon)));
    wrapper.replaceChildren(img);
  }
  return wrapper;
}
function fillCategoryOptions(select, includeAll = false) {
  const selected = select.value;
  select.replaceChildren();
  if (includeAll) { const option = node('option', '', 'Tüm kategoriler'); option.value = 'all'; select.append(option); }
  for (const category of menu.categories) {
    const option = node('option', '', `${category.icon} ${category.names.tr}`); option.value = category.id; select.append(option);
  }
  if ([...select.options].some(o => o.value === selected)) select.value = selected;
}
function render() {
  $('#total-count').textContent = menu.products.length;
  $('#nav-count').textContent = menu.products.length;
  const visibleCategories = new Set(menu.categories.filter(c => c.visible).map(c => c.id));
  $('#visible-count').textContent = menu.products.filter(p => p.visible && visibleCategories.has(p.categoryId)).length;
  $('#category-count').textContent = menu.categories.length;
  fillCategoryOptions($('#category-filter'), true);
  renderProducts(); renderCategories(); updateState();
}
function renderProducts() {
  const query = $('#search').value.trim().toLocaleLowerCase('tr');
  const selectedCategory = $('#category-filter').value;
  const visibility = $('#visibility-filter').value;
  const categories = new Map(menu.categories.map(c => [c.id, c]));
  const filtered = menu.products.filter(p => {
    const visible = p.visible && categories.get(p.categoryId)?.visible;
    return (selectedCategory === 'all' || p.categoryId === selectedCategory) && (visibility === 'all' || (visibility === 'visible' ? visible : !visible)) && LANGUAGES.some(l => p.names[l].toLocaleLowerCase('tr').includes(query));
  });
  const tbody = $('#product-rows'); tbody.replaceChildren();
  for (const product of filtered) {
    const category = categories.get(product.categoryId);
    const row = node('tr');
    const productCell = node('td'); const productContent = node('div', 'product-cell');
    const name = node('div'); name.append(node('span', 'product-name', product.names.tr), node('span', 'product-translations', `${product.names.en} · ${product.names.ar}`));
    productContent.append(thumbnail(product.image, product.icon || category.icon), name); productCell.append(productContent);
    const categoryCell = node('td', '', category.names.tr);
    const priceCell = node('td', 'price-cell', formatPrice(product));
    const statusCell = node('td');
    statusCell.append(node('span', `status${product.visible && category.visible ? '' : ' off'}`, !product.visible ? 'Gizli' : !category.visible ? 'Kategori gizli' : 'Görünür'));
    const actionsCell = node('td'); const actions = node('div', 'row-actions');
    actions.append(
      button('Düzenle', 'button secondary', () => openProduct(product.id), `${product.names.tr} düzenle`),
      button(product.visible ? 'Gizle' : 'Göster', 'button quiet', () => { product.visible = !product.visible; markDirty(); render(); }, `${product.names.tr} ${product.visible ? 'gizle' : 'göster'}`),
      button('Öne', 'icon-button order-button', () => moveProduct(product.id, -1), `${product.names.tr} yukarı taşı`),
      button('Arkaya', 'icon-button order-button', () => moveProduct(product.id, 1), `${product.names.tr} aşağı taşı`),
      button('Sil', 'button quiet danger', () => deleteProduct(product.id), `${product.names.tr} sil`)
    );
    actions.querySelectorAll('.order-button').forEach((b, i) => { b.dataset.product = product.id; b.dataset.direction = i === 0 ? '-1' : '1'; });
    actionsCell.append(actions); row.append(productCell, categoryCell, priceCell, statusCell, actionsCell); tbody.append(row);
  }
  $('#products-empty').hidden = filtered.length > 0;
  $('#result-count').textContent = `${filtered.length} ürün`;
  renderOrderAvailability();
}
function renderOrderAvailability() {
  if (!menu || busy) return;
  document.querySelectorAll('[data-product][data-direction]').forEach(b => {
    const product = menu.products.find(p => p.id === b.dataset.product);
    if (!product) { b.disabled = true; return; }
    const siblings = menu.products.filter(p => p.categoryId === product.categoryId);
    const next = siblings.indexOf(product) + Number(b.dataset.direction);
    b.disabled = next < 0 || next >= siblings.length;
  });
  document.querySelectorAll('[data-category-index]').forEach(b => {
    const index = Number(b.dataset.categoryIndex) + Number(b.dataset.direction);
    b.disabled = index < 0 || index >= menu.categories.length;
  });
}
function renderCategories() {
  const container = $('#category-cards'); container.replaceChildren();
  menu.categories.forEach((category, index) => {
    const card = node('article', 'category-card');
    card.append(node('span', `status${category.visible ? '' : ' off'}`, category.visible ? 'Görünür' : 'Gizli'), node('h3', '', `${category.icon} ${category.names.tr}`), node('p', '', `${category.names.en} · ${category.names.ar}`), node('p', '', `${menu.products.filter(p => p.categoryId === category.id).length} ürün`));
    const actions = node('div', 'row-actions');
    actions.append(button('Düzenle', 'button secondary', () => openCategory(category.id)), button(category.visible ? 'Gizle' : 'Göster', 'button quiet', () => { category.visible = !category.visible; markDirty(); render(); }));
    for (const direction of [-1, 1]) {
      const b = button(direction === -1 ? 'Öne' : 'Arkaya', 'icon-button', () => {
        const other = index + direction;
        if (other < 0 || other >= menu.categories.length) return;
        [menu.categories[index], menu.categories[other]] = [menu.categories[other], menu.categories[index]];
        markDirty(); render();
      }, `${category.names.tr} ${direction === -1 ? 'yukarı' : 'aşağı'} taşı`);
      b.dataset.categoryIndex = index; b.dataset.direction = direction; actions.append(b);
    }
    actions.append(button('Sil', 'button quiet danger', async () => {
      if (menu.products.some(p => p.categoryId === category.id)) { notify('Bu kategoride ürünler var. Önce ürünleri başka bir kategoriye taşıyın veya silin. Geçici olarak gizlemeyi de seçebilirsiniz.', true); return; }
      if (!await askConfirm(`“${category.names.tr}” kategorisini silmek istiyor musunuz?`)) return;
      menu.categories = menu.categories.filter(c => c.id !== category.id); markDirty(); render();
    }));
    card.append(actions); container.append(card);
  });
}
function moveProduct(id, direction) {
  const product = menu.products.find(p => p.id === id);
  const siblings = menu.products.filter(p => p.categoryId === product.categoryId);
  const other = siblings[siblings.indexOf(product) + direction];
  if (!other) return;
  const first = menu.products.indexOf(product), second = menu.products.indexOf(other);
  [menu.products[first], menu.products[second]] = [menu.products[second], menu.products[first]];
  markDirty(); render();
}
async function deleteProduct(id) {
  const product = menu.products.find(p => p.id === id);
  if (!await askConfirm(`“${product.names.tr}” ürününü üç dildeki menüden silmek istiyor musunuz?`)) return;
  menu.products = menu.products.filter(p => p.id !== id);
  pruneImages();
  markDirty('Ürün taslaktan kaldırıldı. Silme işlemi yayımladığınızda siteye yansıyacak.'); render();
}
function setView(next) {
  view = next;
  const info = {
    products: ['Ürünler', 'Fiyatları, görselleri ve üç dildeki ürün bilgilerini tek yerden yönetin.'],
    categories: ['Kategoriler', 'Menünüzün bölümlerini ve sıralamasını düzenleyin.'],
    settings: ['Site ayarları', 'Başlıkları, kapak görselini ve menü yedeklerini yönetin.']
  }[next];
  $('#view-title').textContent = info[0]; $('#view-description').textContent = info[1];
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === next));
  for (const key of ['products', 'categories', 'settings']) $(`#${key}-view`).hidden = key !== next;
  $('#new-button').hidden = next === 'settings';
  $('#new-button').textContent = next === 'categories' ? '+ Kategori ekle' : '+ Ürün ekle';
  updateState();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => menu && setView(b.dataset.view)));
$('#search').addEventListener('input', () => menu && renderProducts());
$('#category-filter').addEventListener('change', () => menu && renderProducts());
$('#visibility-filter').addEventListener('change', () => menu && renderProducts());
$('#new-button').addEventListener('click', () => view === 'categories' ? openCategory() : openProduct());

function fillSettings() {
  for (const l of LANGUAGES) fields(settingsForm)[`title-${l}`].value = menu.settings.titles[l];
  fields(settingsForm).heroImage.value = menu.settings.heroImage;
  $('#hero-upload').value = ''; heroImage = null;
}
function openProduct(id) {
  const product = menu.products.find(p => p.id === id);
  productForm.reset(); workingImage = null; activeUpload++;
  $('#product-error').textContent = '';
  $('#product-dialog-title').textContent = product ? 'Ürünü düzenle' : 'Ürün ekle';
  fillCategoryOptions(fields(productForm).categoryId);
  fields(productForm).id.value = product?.id || '';
  for (const lang of LANGUAGES) {
    fields(productForm)[`name-${lang}`].value = product?.names[lang] || '';
    fields(productForm)[`description-${lang}`].value = product?.descriptions[lang] || '';
  }
  fields(productForm).categoryId.value = product?.categoryId || ($('#category-filter').value !== 'all' ? $('#category-filter').value : menu.categories[0]?.id);
  fields(productForm).price.value = product?.price ?? '';
  fields(productForm).extraPrice.value = product?.extraPrice ?? '';
  fields(productForm).image.value = product?.image || '';
  fields(productForm).icon.value = product?.icon || '☕';
  fields(productForm).visible.checked = product?.visible ?? true;
  updateProductImage(); $('#product-dialog').showModal();
}
function updateProductImage() {
  const container = $('#product-image-preview');
  container.replaceChildren(...thumbnail(fields(productForm).image.value.trim(), fields(productForm).icon.value || '☕', 'image-preview', workingImage).childNodes);
}
fields(productForm).image.addEventListener('input', updateProductImage);
fields(productForm).icon.addEventListener('input', updateProductImage);

async function processImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('JPG, PNG veya WebP görseli seçin.');
  if (file.size > 10 * 1024 * 1024) throw Error('Görsel 10 MB’tan küçük olmalıdır.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw Error('Bu görsel okunamadı. Başka bir fotoğraf seçin.'); }
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', .86);
    const mime = result.slice(5, result.indexOf(';'));
    const base64 = result.split(',')[1];
    if (!base64 || base64.length > 2800000) throw Error('Görsel küçültülemedi. Daha küçük bir fotoğraf seçin.');
    return { path: `uploads/${crypto.randomUUID()}.${mime === 'image/webp' ? 'webp' : 'png'}`, mime, base64 };
  } finally { bitmap.close(); }
}
$('#product-upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const request = ++activeUpload;
  const submit = productForm.querySelector('[type=submit]'); submit.disabled = true;
  $('#product-error').textContent = 'Görsel hazırlanıyor…';
  try {
    const result = await processImage(file);
    if (request !== activeUpload || !$('#product-dialog').open) return;
    workingImage = result; fields(productForm).image.value = result.path; updateProductImage(); $('#product-error').textContent = '';
  } catch (error) { if (request === activeUpload) $('#product-error').textContent = error.message; }
  finally { if (request === activeUpload) submit.disabled = false; }
});
productForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = fields(productForm);
    const id = f.id.value || `urun-${crypto.randomUUID()}`;
    const product = { id, categoryId: f.categoryId.value, names: Object.fromEntries(LANGUAGES.map(l => [l, f[`name-${l}`].value.trim()])), descriptions: Object.fromEntries(LANGUAGES.map(l => [l, f[`description-${l}`].value.trim()])), price: Number(f.price.value), extraPrice: f.extraPrice.value === '' ? null : Number(f.extraPrice.value), image: f.image.value.trim(), icon: f.icon.value.trim(), visible: f.visible.checked };
    const next = clone(menu); const index = next.products.findIndex(p => p.id === id);
    if (index >= 0) next.products[index] = product; else next.products.push(product);
    validateMenu(next); menu = next;
    if (workingImage && workingImage.path === product.image) pendingImages.set(workingImage.path, workingImage);
    pruneImages(); markDirty(); render(); $('#product-dialog').close();
  } catch (error) { $('#product-error').textContent = error.message; }
});

function openCategory(id) {
  const category = menu.categories.find(c => c.id === id);
  categoryForm.reset(); $('#category-error').textContent = '';
  $('#category-dialog-title').textContent = category ? 'Kategoriyi düzenle' : 'Kategori ekle';
  const f = fields(categoryForm); f.id.value = id || '';
  for (const l of LANGUAGES) f[`name-${l}`].value = category?.names[l] || '';
  f.icon.value = category?.icon || '☕'; f.visible.checked = category?.visible ?? true;
  $('#category-dialog').showModal();
}
categoryForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = fields(categoryForm), id = f.id.value || `kategori-${crypto.randomUUID()}`;
    const category = { id, icon: f.icon.value.trim(), names: Object.fromEntries(LANGUAGES.map(l => [l, f[`name-${l}`].value.trim()])), visible: f.visible.checked };
    const next = clone(menu), index = next.categories.findIndex(c => c.id === id);
    if (index >= 0) next.categories[index] = category; else next.categories.push(category);
    validateMenu(next); menu = next; markDirty(); render(); $('#category-dialog').close();
  } catch (error) { $('#category-error').textContent = error.message; }
});
$('#hero-upload').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const submit = settingsForm.querySelector('[type=submit]'); submit.disabled = true;
  try { heroImage = await processImage(file); fields(settingsForm).heroImage.value = heroImage.path; notify('Kapak fotoğrafı hazır. Ayarları uygula düğmesine basın.'); }
  catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; }
});
settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const f = fields(settingsForm); const next = clone(menu);
    next.settings = { titles: Object.fromEntries(LANGUAGES.map(l => [l, f[`title-${l}`].value.trim()])), heroImage: f.heroImage.value.trim() };
    validateMenu(next); menu = next;
    if (heroImage && heroImage.path === menu.settings.heroImage) pendingImages.set(heroImage.path, heroImage);
    heroImage = null; pruneImages(); markDirty(); render();
  } catch (error) { notify(error.message, true); }
});
function pruneImages() {
  const used = new Set([menu.settings.heroImage, ...menu.products.map(p => p.image)]);
  for (const path of pendingImages.keys()) if (!used.has(path)) pendingImages.delete(path);
}

document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('#product-dialog').addEventListener('close', () => { activeUpload++; productForm.querySelector('[type=submit]').disabled = false; });
$('#connect-button').addEventListener('click', () => {
  const f = fields($('#connect-form'));
  f.repository.value = config.repository || 'bezmisafa/menuu';
  f.branch.value = config.branch || ''; f.directory.value = config.directory || ''; f.token.value = '';
  $('#connect-error').textContent = ''; $('#connect-dialog').showModal();
});
$('#connect-dialog').addEventListener('close', () => { fields($('#connect-form')).token.value = ''; });
$('#connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  const f = fields(event.target);
  const submit = $('#connect-submit'); submit.disabled = true; submit.textContent = 'Bağlanıyor…';
  $('#connect-error').textContent = '';
  let client;
  try {
    client = new GitHubMenu({ repository: f.repository.value, branch: f.branch.value, directory: f.directory.value, token: f.token.value.trim() });
    f.token.value = '';
    const remote = await client.connect();
    if (dirty && (JSON.stringify(remote) !== baseline || client.repository !== config.repository || client.directory !== (config.directory || '') || (config.branch && client.branch !== config.branch))) throw Error('Bu taslak GitHub’daki güncel menüyle eşleşmiyor. Önce Ayarlar’dan yedeğini indirin, ardından “Son menüyü yeniden yükle” ile güncel menüyü açın.');
    connection?.disconnect(); connection = client;
    config = { repository: client.repository, branch: client.branch, directory: client.directory };
    try { localStorage.setItem('bezmi-safa-connection', JSON.stringify(config)); } catch { /* Connection can still work without local storage. */ }
    if (!dirty) { menu = remote; baseline = JSON.stringify(remote); pendingImages.clear(); }
    if (dirty) await saveDraft();
    render(); fillSettings(); $('#connect-dialog').close();
    notify('GitHub’a bağlandı. Değişiklikleri hazırlayıp tek seferde yayımlayabilirsiniz.');
  } catch (error) { if (client !== connection) client?.disconnect(); $('#connect-error').textContent = error.message; }
  finally { f.token.value = ''; submit.disabled = false; submit.textContent = 'Bağlan ve menüyü yükle'; }
});
$('#logout-button').addEventListener('click', () => {
  connection?.disconnect(); connection = null; updateState(); renderProducts();
  notify('GitHub bağlantısı kapatıldı ve anahtar bellekten silindi. Taslağınız bu cihazda duruyor.');
});

$('#publish-button').addEventListener('click', async () => {
  if (busy || !dirty || !connection) return;
  busy = true; updateState();
  try {
    const result = await connection.publish(clone(menu), new Map(pendingImages), notify);
    baseline = JSON.stringify(menu); dirty = false; pendingImages.clear();
    clearTimeout(saveTimer);
    await draftStore('readwrite', s => s.delete('current')).catch(() => {});
    notify('Menü GitHub’a kaydedildi. GitHub Pages yayını güncellediğinde sitede görünecek; bu işlem birkaç dakika sürebilir.', false, result.url);
    renderProducts();
  } catch (error) { notify(error.message, true); }
  finally { busy = false; updateState(); }
});

function sendPreview() {
  const images = Object.fromEntries([...pendingImages].map(([path, image]) => [path, `data:${image.mime};base64,${image.base64}`]));
  if (connection) for (const path of new Set([menu.settings.heroImage, ...menu.products.map(p => p.image)])) if (path && !images[path]) images[path] = sourceFor(path);
  $('#preview-frame').contentWindow.postMessage({ type: 'menu-preview', menu: clone(menu), images }, location.origin);
}
function loadPreview() { $('#preview-frame').src = `../${{ tr: 'bezmisafa.html', en: 'english.html', ar: 'arabic.html' }[$('#preview-language').value]}?preview=1`; }
$('#preview-frame').addEventListener('load', () => { if (menu) sendPreview(); });
$('#preview-button').addEventListener('click', () => { $('#preview-dialog').showModal(); loadPreview(); });
$('#preview-language').addEventListener('change', loadPreview);
$('#preview-dialog').addEventListener('close', () => { $('#preview-frame').removeAttribute('src'); });

$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ backupVersion: 1, menu, images: [...pendingImages] }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = node('a');
  a.href = url; a.download = `bezmi-safa-menu-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify('Menü yedeği indirildi. Yayınlanmamış görseller de yedeğe eklendi.');
});
function validateImages(images) {
  if (!Array.isArray(images) || images.length > 3000) throw Error('Geçersiz yedek görselleri.');
  let size = 0;
  const result = new Map();
  for (const entry of images) {
    if (!Array.isArray(entry) || entry.length !== 2) throw Error('Geçersiz yedek görseli.');
    const [path, image] = entry;
    if (!/^uploads\/[a-z0-9-]+\.(png|jpg|webp)$/.test(path) || !image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) || typeof image.base64 !== 'string' || image.base64.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) throw Error('Yedekte geçersiz bir görsel var.');
    size += image.base64.length; if (size > 40 * 1024 * 1024) throw Error('Yedekteki görseller çok büyük.');
    result.set(path, { path, mime: image.mime, base64: image.base64 });
  }
  return result;
}
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 45 * 1024 * 1024) throw Error('Yedek dosyası çok büyük.');
    const backup = JSON.parse(await file.text());
    const next = validateMenu(backup.backupVersion === 1 ? backup.menu : backup);
    const images = backup.backupVersion === 1 ? validateImages(backup.images) : new Map();
    if (!await askConfirm('Yedekteki menü mevcut taslağın yerine geçecek. Devam edilsin mi?')) return;
    menu = clone(next); pendingImages = images; pruneImages();
    markDirty('Yedek taslağa alındı. İnceleyip yayımlayabilirsiniz.'); render(); fillSettings();
  } catch (error) { notify(error.message || 'Yedek okunamadı.', true); }
  finally { event.target.value = ''; }
});
$('#reload-button').addEventListener('click', async () => {
  if (dirty && !await askConfirm('Yayınlanmamış taslağınız silinip son menü yüklenecek. Devam edilsin mi?')) return;
  busy = true; updateState();
  try {
    const next = connection ? await connection.connect() : await loadLocal();
    menu = validateMenu(next); baseline = JSON.stringify(menu); pendingImages.clear(); dirty = false;
    clearTimeout(saveTimer); await draftStore('readwrite', s => s.delete('current')).catch(() => {});
    render(); fillSettings(); notify('Son menü yüklendi.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; updateState(); }
});
window.addEventListener('beforeunload', event => {
  if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });

async function loadLocal() {
  const response = await fetch('../data/menu.json', { cache: 'no-store' });
  if (!response.ok) throw Error('Menü dosyası yüklenemedi. Siteyi bir HTTP sunucusundan açın.');
  return validateMenu(await response.json());
}
async function init() {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (response.ok) config = await response.json();
    try { config = { ...config, ...JSON.parse(localStorage.getItem('bezmi-safa-connection') || '{}') }; } catch { /* Private browsing can disable storage. */ }
    menu = await loadLocal(); baseline = JSON.stringify(menu);
    let recovered = false;
    try {
      const saved = await draftStore('readonly', s => s.get('current'));
      if (saved?.menu && saved.repository === config.repository && (saved.directory || '') === (config.directory || '')) {
        const restored = validateMenu(saved.menu);
        const images = validateImages(saved.images);
        if (typeof saved.baseline !== 'string') throw Error('Invalid draft');
        menu = restored; baseline = saved.baseline; pendingImages = images; dirty = true; recovered = true;
      }
    } catch { /* Keep the published menu if a saved draft is unreadable. */ }
    render(); fillSettings();
    notify(recovered ? 'Bu cihazdaki yayınlanmamış taslak geri yüklendi. GitHub’a bağlanıp devam edebilirsiniz.' : 'Menünüz hazır. Düzenlemeye başlayabilirsiniz. Yayımlamak için GitHub’a bağlanın.');
  } catch (error) { notify(error.message, true); }
}
init();
