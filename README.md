# Bezm-i Safa menü yönetimi

Türkçe, İngilizce ve Arapça menüler aynı `data/menu.json` dosyasını kullanır. Ürün fiyatı, ek ücret, görsel, kategori ve görünürlük ortaktır; adlar ve açıklamalar her dil için ayrı düzenlenir. Mevcut 120 ürünün çevirileri korunmuştur. Yeni ürünlerde üç dildeki adları siz girersiniz; otomatik çeviri servisi kullanılmaz.

## Bilgisayarda açma

Node.js 20 veya üzeri kuruluysa bu klasörde:

```sh
npm start
```

- Menü: http://localhost:4173/
- Panel: http://localhost:4173/admin/

Bağımlılık kurulumu ve derleme gerekmez. HTML dosyalarına çift tıklamak yerine HTTP üzerinden açın; menü JSON dosyasından yüklenir.

## GitHub Pages'e ilk kurulum

Bu klasördeki değişiklikler henüz GitHub'a gönderilmiş sayılmaz. İlk kurulumda aşağıdaki dosya ve klasörleri **birlikte**, mevcut `bezmisafa/menuu` deposunun Pages yayın klasörüne yükleyin:

- `bezmisafa.html`, `english.html`, `arabic.html`, `style.css`
- `assets/`, `data/`, `admin/`, `.nojekyll`

Mevcut `index.html`, `resimler/` ve `CNAME` dosyalarını koruyun. Bu kurulum alan adını ve mevcut menü adreslerini değiştirmez. `package.json`, `scripts/` ve `tests/` yerel geliştirme içindir, canlı sitenin çalışması için gerekmez.

GitHub deposundaki **Settings → Pages** bölümünden yayın dalını ve klasörünü kontrol edin. Panel varsayılan olarak deponun varsayılan dalını ve kök klasörünü kullanır. Pages farklı bir dal veya `/docs` kullanıyorsa panelin bağlantı ekranında aynı dalı ve `docs` klasörünü seçin. `admin/config.json` içindeki `branch` ve `directory` alanlarıyla kalıcı başlangıç değerleri de belirleyebilirsiniz. GitHub Actions ile yayın yapılıyorsa iş akışının `assets`, `data`, `admin` ve `uploads` klasörlerini çıktıya dahil etmesi gerekir.

Pages yayını tamamlanınca sitenin adresinin sonuna `/admin/` ekleyerek panele girin. Örneğin mevcut alan adı korunursa `https://bezmisafa.com/admin/` olur.

## GitHub bağlantısı

GitHub Pages yalnızca statik dosyaları sunduğu için ayrı bir sunucu parolası kullanılmaz. Yazma yetkisi GitHub üzerinden doğrulanır. Panelde **GitHub'a bağlan** düğmesine basın:

1. Depo: `bezmisafa/menuu`.
2. Dal ve klasör: Settings → Pages ile aynı olmalı.
3. [GitHub fine-grained token](https://github.com/settings/personal-access-tokens/new) oluşturun. Repository access altında yalnızca `menuu` deposunu seçin. Repository permissions altında **Contents: Read and write** verin. Bir son kullanma tarihi seçin.
4. Anahtarı yalnızca paneldeki erişim anahtarı alanına yapıştırın.

Anahtarı kod dosyasına, GitHub deposuna veya sohbete koymayın. Panel anahtarı dosyaya, tarayıcı depolamasına veya menü yedeğine yazmaz; yalnızca sekmenin belleğinde tutar ve `api.github.com` isteklerinde kullanır. Sekmeyi yenilediğinizde/kapattığınızda veya bağlantıyı kestiğinizde yeniden bağlanmak gerekir. GitHub'da dal koruma kuralları doğrudan yazmayı engelliyorsa panel bunu hata olarak gösterir.

GitHub'ın [erişim anahtarları belgesi](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) ve [Git tree API belgesi](https://docs.github.com/en/rest/git/trees) yetki ve kayıt modelini açıklar.

## Günlük kullanım

1. Ürünü arayın veya kategoriden filtreleyin; **Düzenle** ile fiyatı, üç dildeki ad/açıklamayı ve görseli değiştirin.
2. Bilgisayardan veya telefondan JPG, PNG ya da WebP yükleyebilirsiniz. Görseller en fazla 1200 piksele küçültülür. Görsel bağlantısı veya mevcut `resimler/...` yolu da kullanılabilir.
3. **Değişiklikleri uygula** ürün değişikliğini taslağa ekler.
4. Ürün/kategori ekleyebilir, sıralayabilir, gizleyebilir veya silebilirsiniz. Ürün içeren kategori doğrudan silinemez; önce ürünleri taşıyın veya kategoriyi gizleyin.
5. **Önizle** ile Türkçe, İngilizce ve Arapça görünümü kontrol edin. Arapça menü sağdan sola gösterilir.
6. **Değişiklikleri yayımla** menü ve yeni görselleri tek GitHub commit'iyle kaydeder. GitHub Pages yayını tamamlandığında ziyaretçilere yansır; bu işlem anlık olmayabilir.

Taslak ve henüz yayınlanmamış fotoğraflar IndexedDB ile bu tarayıcıda saklanır. Bu otomatik kayıt canlı siteyi değiştirmez. Site ayarlarından görselleri de içeren JSON yedeği indirebilir ve içe aktarabilirsiniz. Yayınlanmış görseller zaten depoda bulunur; yedek onların dosya yollarını içerir. Silinen ürünlerin eski görselleri depodan otomatik silinmez; bu, geçmiş kayıtların ve diğer ürünlerin görsellerini korur.

Menü başka bir oturumda değişmişse panel eski taslağı onun üzerine yazmaz. Yedeği indirip **Son menüyü yeniden yükle** ile güncel veriyi alın. Yeni görseller ve menü aynı commit ile kaydedilir; yarıda kalan yükleme menüyü değiştirmez. GitHub'daki commit geçmişi, yanlış yayını geri almak için kullanılabilir.

## Kontroller

```sh
npm test
```

Kontroller veri bütünlüğünü, çevirileri, mevcut görsel dosyalarını ve GitHub API'nin temsili yanıtları üzerinden atomik kayıt, eşzamanlı düzenleme, yükleme hatası ve bağlantı kesintisi senaryolarını kapsar. Gerçek GitHub'a yazma testi için sizin depoya yetkili bir anahtarla panelden bağlanmanız gerekir.
