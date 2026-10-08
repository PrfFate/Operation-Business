# Operasyon Merkezi

SMS ve XML karşılaştırma, ölçü dönüşümü ve ücret hesaplama araçlarını bir araya getiren Türkçe çalışma alanı. Kurulum veya derleme gerektirmez.

## Başlatma

`index.html` dosyasını güncel Chrome, Edge veya Firefox ile açın. Tüm işlevler tarayıcıda çalışır. Metinler sunucuya gönderilmez ve kalıcı olarak saklanmaz. Pano izni verilmezse standart Ctrl+C / Ctrl+V veya macOS kısayolları kullanılabilir.

İsteğe bağlı yerel sunucu:

```powershell
python -m http.server 8091 --bind 127.0.0.1
```

Ardından `http://localhost:8091` adresini açın.

Sol menünün dikey ortasındaki ok düğmesi masaüstünde menüyü simge görünümüne daraltır ve çalışma alanını genişletir. Menü tercihi tarayıcıda saklanır; işlem girdileri saklanmaz. Mobilde menü başlangıçta kapalıdır, bir araç seçildiğinde veya Escape tuşuna basıldığında kapanır.

## Özellikler

- XML dosyaları ve metinleri için yapısal karşılaştırma ve fark raporu.
- İkili / ondalık tabanlarda veri boyutu dönüşümü.
- Ses, data ve e-dergi tutarlarından ücret hesaplama.
- Yan yana iki metnin canlı ve birebir karşılaştırılması; renkli fark vurguları.
- Türkçe kurallarla büyük/küçük harf ve tüm Unicode boşluklarını yok sayma seçenekleri.
- ASCII dışı karakterlerin kod noktası, satır, sütun ve karakter sırasıyla listelenmesi.
- Sekme, satır sonu, sıfır genişlikli ve kontrol karakterlerinin ayrı incelenmesi.
- Unicode kod noktası sayısı, UTF-8 bayt sayısı, GSM-7 / Unicode kodlaması ve SMS parça tahmini.
- Örnek metinler, kopyalama, yapıştırma, yer değiştirme, temizleme ve UTF-8 TXT raporu.
- Klavye ile kullanılabilen sekmeler, açıklamalar ve iletişim pencereleri.

## Hesaplama notları

ASCII, U+0000–U+007F aralığıdır; GSM-7 ile aynı değildir. Örneğin `ö` ASCII dışındadır ancak standart GSM alfabesindedir. GSM uzantı karakterleri 2 septet kullanır. GSM-7 için 160 / çok parçalı 153 septet, Unicode için 70 / çok parçalı 67 UTF-16 birimi kullanılır. Uzantı kaçışları ve UTF-16 surrogate çiftleri segment sınırında bölünmez. Operatörün ulusal dil tabloları ve kodlama politikası sonuçları değiştirebilir.

Karakter sayısı ve konumlar Unicode kod noktalarını sayar; görsel karakter (grapheme) sayısı değildir. Form limiti her metin için 10.000 UTF-16 birimidir. Tarayıcı metin alanları CRLF satır sonlarını LF’ye dönüştürür; kaynak dosyaların bayt düzeyinde karşılaştırılması amaçlanmaz. NFC/NFKC normalizasyonu uygulanmaz.

Benzerlik ortak karakter dizisine göre hesaplanır. Bir ekleme, silme veya değiştirme bir fark olarak sayılır; fark bloklarında eklenen ve silinen uzunlukların büyüğü alınır. Uzun ve çok farklı metinler için işlem maliyeti sınırlanır; bu durumda yaklaşık benzerlik/fark bilgisi arayüzde belirtilir. Eşitlik kontrolü daima kesindir. Boş metinler için arayüz sonuç üretmek yerine giriş bekler.

Resmî referanslar: [ETSI GSM alfabesi](https://www.etsi.org/deliver/etsi_ts/123000_123099/123038/16.00.00_60/ts_123038v160000p.pdf), [Twilio SMS karakter sınırları](https://www.twilio.com/docs/glossary/what-sms-character-limit).

## Doğrulama

`tests/engine-tests.html` dosyasını tarayıcıda açın. Testler Unicode, ASCII/GSM farkları, segment sınırları, özel Unicode boşlukları, emoji, karşılaştırma seçenekleri ve 300 deterministik rastgele karşılaştırma vakasını kapsar.

Arayüz testleri için yukarıdaki yerel sunucuyu başlatın ve `http://localhost:8091/tests/ui-tests.html` adresini açın. Bu testler canlı girişleri, filtreleri, pano izni reddi davranışını, rapor içeriğini, uzun metinleri, güvenli metin gösterimini, açılır/kapanır menüyü, araçlar arası geçişi ve 320 / 390 piksel mobil yerleşimleri denetler. Dosyadan çalıştırılırsa tarayıcıların iframe erişim kısıtlamaları nedeniyle yerel sunucu gerekir. Pano işlemleri testlerde taklit edilir; kullanıcı panosu okunmaz veya değiştirilmez.

## Dosyalar

- `index.html`: Arayüz ve erişilebilir HTML yapısı.
- `styles.css`: Duyarlı kurumsal tasarım; dış font veya bağımlılık içermez.
- `app.js`: Canlı arayüz, vurgulama, filtreler, pano ve rapor işlemleri.
- `sms-engine.js`: Bağımsız SMS analiz ve karşılaştırma motoru.
- `xml-engine.js`: Bağımsız XML karşılaştırma ve canonical fark motoru.
- `converter-engine.js`: SOLID ve Strategy Pattern tabanlı veri boyutu/ölçü dönüştürme motoru.
- `converter-ui.js`: Ölçü birimi dönüştürücü arayüzü ve olay yöneticisi.
