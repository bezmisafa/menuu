# Bezm-i Safa menüsü

Türkçe, İngilizce ve Arapça menüler ortak data/menu.json dosyasından yüklenir. Fiyat ve görseller ortaktır.

- Menü: https://bezmisafa.github.io/menuu/
- Özel yönetim: https://bezmi-safa-ozel-panel-20261126.seasonalvine1.chatgpt.site/admin/

Yönetim paneli ayrı bir özel yayında tutulur. Sunucu, yalnızca panel sahibinin ChatGPT hesabına erişim verir. GitHub Pages üzerindeki admin/index.html yalnızca özel giriş adresine yönlendirir; burada yönetim uygulaması sunulmaz.

Ürünleri değiştirmek için özel panele hesabınızla giriş yapın, ardından GitHub bağlantısını kurun. Ürün, fiyat ve görsel değişiklikleri GitHub deposuna kaydedilip menüye yansır. Erişim anahtarını hiçbir dosyaya veya bu depoya koymayın.

Yerel menüyü açmak için Node.js 20 veya üzerinde npm start çalıştırın. Veri bütünlüğü kontrolleri npm test ile çalışır. Yerel geliştirme sunucusu yalnızca 127.0.0.1 üzerinde dinler.
