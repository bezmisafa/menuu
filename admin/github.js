import { validateMenu } from '../assets/model.js';

const API = 'https://api.github.com';
export const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
export function parseRepository(value) {
  const cleaned = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(cleaned)) throw Error('Depoyu kullanıcı/depo biçiminde yazın.');
  return cleaned;
}
export function normalizeDirectory(value) {
  const directory = value.trim().replace(/^\/+|\/+$/g, '');
  if (directory && (!/^[a-zA-Z0-9_./-]+$/.test(directory) || directory.split('/').some(p => !p || p === '.' || p === '..'))) throw Error('Yayın klasörünü kontrol edin. Kök dizin için boş bırakın.');
  return directory;
}
export function decodeContent(base64) {
  return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, '')), c => c.charCodeAt(0)));
}

export class GitHubMenu {
  #token;
  constructor({ repository, branch = '', directory = '', token, fetcher = fetch }) {
    this.repository = parseRepository(repository);
    this.branch = branch.trim();
    this.directory = normalizeDirectory(directory);
    this.#token = token;
    this.fetcher = fetcher;
    this.base = `/repos/${this.repository}`;
    this.menuPath = this.path('data/menu.json');
    this.menuSha = null;
  }
  path(path) { return this.directory ? `${this.directory}/${path}` : path; }
  async request(path, method = 'GET', body) {
    let response;
    try {
      // Browser fetch must not receive this GitHubMenu instance as its receiver.
      // Node's fetch and arrow-function mocks do not enforce that restriction.
      const fetcher = this.fetcher;
      response = await fetcher(`${API}${this.base}${path}`, {
        method,
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.#token}`, 'X-GitHub-Api-Version': '2026-03-10', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(45000)
      });
    } catch { throw Error('GitHub’a ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'); }
    if (!response.ok) {
      const error = new Error({
        401: 'GitHub erişim anahtarı geçersiz veya süresi dolmuş.',
        403: 'GitHub işlemi reddetti. Anahtarın bu depoya Contents: Read and write iznini, kota durumunu ve dal kurallarını kontrol edin.',
        404: 'Depo, dal veya menü dosyası bulunamadı. Önce yeni site dosyalarını deponuza yükleyin; depo, dal ve yayın klasörünü kontrol edin.',
        409: 'Depoda başka bir değişiklik var. Yedeğinizi indirip son menüyü yeniden yükleyin.',
        422: 'GitHub güncellemeyi kabul etmedi. Dal kurallarını kontrol edin veya son menüyü yeniden yükleyin.',
        429: 'GitHub istek sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.'
      }[response.status] || `GitHub işlemi başarısız oldu (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async connect() {
    const repo = await this.request('');
    if (!this.branch) this.branch = repo.default_branch;
    const head = await this.request(`/git/ref/heads/${encodePath(this.branch)}`);
    const file = await this.readMenu(head.object.sha);
    const menu = validateMenu(JSON.parse(decodeContent(file.content)));
    this.menuSha = file.sha;
    return menu;
  }
  readMenu(ref) { return this.request(`/contents/${encodePath(this.menuPath)}?ref=${encodeURIComponent(ref)}`); }

  async publish(menu, images = new Map(), progress = () => {}) {
    validateMenu(menu);
    // Read at one immutable commit, then refuse stale edits and never force-push.
    progress('Güncel menü kontrol ediliyor…');
    const refPath = `/git/refs/heads/${encodePath(this.branch)}`;
    const head = await this.request(`/git/ref/heads/${encodePath(this.branch)}`);
    const parent = head.object.sha;
    const current = await this.readMenu(parent);
    if (current.sha !== this.menuSha) throw Error('Menü başka bir oturumdan değiştirilmiş. Üzerine yazılmadı. Taslağın yedeğini indirip güncel menüyü yeniden yükleyin.');
    const commit = await this.request(`/git/commits/${parent}`);
    const tree = [{ path: this.menuPath, mode: '100644', type: 'blob', content: JSON.stringify(menu, null, 2) + '\n' }];
    const used = new Set([menu.settings.heroImage, ...menu.products.map(p => p.image)]);
    for (const [path, image] of images) {
      if (!used.has(path)) continue;
      if (!/^uploads\/[a-z0-9-]+\.(jpg|png|webp)$/.test(path)) throw Error('Geçersiz görsel dosyası.');
      progress('Görseller yükleniyor…');
      const blob = await this.request('/git/blobs', 'POST', { content: image.base64, encoding: 'base64' });
      tree.push({ path: this.path(path), mode: '100644', type: 'blob', sha: blob.sha });
    }
    progress('Menü ve görseller birlikte kaydediliyor…');
    const createdTree = await this.request('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
    const next = await this.request('/git/commits', 'POST', { message: 'Menü yönetim panelinden güncellendi', tree: createdTree.sha, parents: [parent] });
    // Fetch the new menu's blob before updating the branch, so a post-publish
    // network failure cannot leave the UI with an obsolete concurrency token.
    const nextFile = await this.readMenu(next.sha);
    try {
      await this.request(refPath, 'PATCH', { sha: next.sha, force: false });
    } catch (error) {
      // A lost response may follow a successful update. Reconcile once.
      const latest = await this.request(`/git/ref/heads/${encodePath(this.branch)}`).catch(() => null);
      if (latest?.object.sha !== next.sha) throw error;
    }
    this.menuSha = nextFile.sha;
    return { sha: next.sha, url: `https://github.com/${this.repository}/commit/${next.sha}` };
  }
  disconnect() { this.#token = ''; }
}
