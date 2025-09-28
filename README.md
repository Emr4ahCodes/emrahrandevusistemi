# Firebase tabanlı Online Randevu

Basit bir tek sayfalık (SPA değil) HTML/JS uygulaması. Firestore ile çakışmasız randevu kaydı yapar.

## Özellikler
- 09:00–17:00 arası 30 dakikalık slotlar
- Seçili hizmet ve tarihte dolu saatlerin gizlenmesi
- Firestore transaction ile aynı slota çift kayıt engeli
- Admin sayfasında randevuları listeleme (`admin.html`)

## Kurulum
1) Firebase Console'da bir proje oluşturun ve Web App ekleyin.
2) Proje yapılandırmasını `index.html` ve `admin.html` içindeki `window.FIREBASE_CONFIG` alanına yapıştırın.

Örnek:
```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "<proj>.firebaseapp.com",
  projectId: "<proj>",
  appId: "..."
};
```

3) Firestore'u etkinleştirin (Native mode).
4) Güvenlik kurallarını aşağıdaki gibi ayarlayın (geliştirme için). Üretimde daha kısıtlayın.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appointments/{id} {
      allow read: if true; // admin sayfası için basit
      allow create: if true; // basit örnek; üretimde doğrulama ekleyin
    }
    match /appointmentKeys/{id} {
      allow read: if false; // gerek yok
      allow write: if true; // transaction için
    }
  }
}
```

Not: Üretimde kimlik doğrulama (Auth) ve kuralları sıkılaştırın. Örneğin sadece anonim oturum açmış kullanıcıların create yapabilmesi gibi.

## Çalıştırma
Bu proje saf HTML/JS'dir. Bir statik sunucuda veya VS Code Live Server ile açabilirsiniz.

- `index.html` kullanıcı randevu alma sayfası
- `admin.html` listeleme sayfası

Windows PowerShell ile basit bir yerel sunucu (opsiyonel):
```powershell
# Python yüklüyse
python -m http.server 8000
```
Ardından tarayıcıdan http://localhost:8000 yoluyla dosyalara ulaşabilirsiniz.

