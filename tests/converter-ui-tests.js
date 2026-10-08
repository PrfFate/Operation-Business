(function () {
  "use strict";
  const frame = document.getElementById("app-frame");
  const results = [];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message || "Assertion failed"); };
  const same = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + " != " + JSON.stringify(expected));

  async function run() {
    const app = frame.contentWindow;
    const doc = frame.contentDocument;
    const $ = (id) => doc.getElementById(id);
    const text = (id) => $(id) ? $(id).textContent.trim() : "";
    const event = (type) => new app.Event(type, { bubbles: true });

    async function test(name, fn) {
      try {
        await fn();
        results.push({ name, passed: true, error: "" });
      } catch (error) {
        results.push({ name, passed: false, error: error.message });
      }
      document.getElementById("test-results").textContent = results.map((entry) => (entry.passed ? "✓ " : "✗ ") + entry.name + (entry.error ? "\n  " + entry.error : "")).join("\n");
      const passedCount = results.filter(r => r.passed).length;
      const failedCount = results.filter(r => !r.passed).length;
      document.getElementById("test-summary").textContent = `${passedCount} başarılı, ${failedCount} başarısız.`;
      document.getElementById("test-summary").className = failedCount ? "fail" : "pass";
      document.documentElement.dataset.testResult = failedCount ? "failed" : "passed";
    }

    await delay(300);

    await test("Sol menüde 'Ölçü dönüştürücü' bağlantısı mevcuttur", () => {
      const link = doc.querySelector('[data-view-link="converter"]');
      assert(link, "Sol menüde dönüştürücü linki bulunamadı");
      assert(link.textContent.includes("Ölçü dönüştürücü"));
    });

    await test("Menü tıklandığında dönüştürücü görünümü açılır ve breadcrumb güncellenir", () => {
      const link = doc.querySelector('[data-view-link="converter"]');
      link.click();
      assert(!$("converter-view").hidden, "converter-view görünür olmalı");
      const breadcrumb = doc.querySelector(".breadcrumb span:last-child");
      same(breadcrumb.textContent, "Ölçü Birimi Dönüştürücü");
    });

    await test("Görseldeki 650 MB başlangıç değeri tüm alanlara doğru yansıtılmıştır", () => {
      const bitInput = $("converter-input-b");
      const byteInput = $("converter-input-B");
      const kbInput = $("converter-input-kB");
      const mbInput = $("converter-input-MB");

      assert(bitInput && byteInput && kbInput && mbInput, "Girdi alanları mevcut olmalı");
      same(mbInput.value, "650");
      // Türkçe binlik ayracı ile 5.452.595.200
      same(bitInput.value, "5.452.595.200");
      same(byteInput.value, "681.574.400");
      same(kbInput.value, "665.600");
    });

    await test("Ondalık (1000 / SI) tabanına geçildiğinde değerler anında güncellenir", () => {
      $("converter-std-decimal").click();
      same($("converter-input-kB").value, "650.000");
      same($("converter-input-B").value, "650.000.000");
      same($("converter-input-b").value, "5.200.000.000");
    });

    await test("İkili (1024 / IEC) tabanına geri dönüldüğünde değerler tekrar ikili hesaba döner", () => {
      $("converter-std-binary").click();
      same($("converter-input-b").value, "5.452.595.200");
    });

    await test("İki yönlü etkileşim: Byte alanına 1024 yazıldığında diğer tüm birimler güncellenir", () => {
      const byteInput = $("converter-input-B");
      byteInput.value = "1024";
      byteInput.dispatchEvent(event("input"));

      same($("converter-input-b").value, "8.192");
      same($("converter-input-kB").value, "1");
      same($("converter-input-MB").value, "0,000977");
    });

    await test("Temizle butonu tüm alanları ve özet kartlarını sıfırlar", () => {
      $("converter-clear-all").click();
      same($("converter-input-b").value, "");
      same($("converter-input-B").value, "");
      same($("converter-input-MB").value, "");
      same($("converter-active-unit-title").textContent, "Girdi Bekleniyor");
    });

    await test("Örnek yükle (650 MB) butonu görseldeki değerleri tekrar doldurur", () => {
      $("converter-load-example").click();
      same($("converter-input-MB").value, "650");
      same($("converter-input-b").value, "5.452.595.200");
    });

    await test("Kopyalama butonu panoya kopyalama işlemini tetikler", async () => {
      const copyBtn = doc.querySelector('[data-copy-unit="MB"]');
      assert(copyBtn, "MB kopyalama butonu olmalı");
      copyBtn.click();
      await delay(50);
      assert(!$("toast").hidden, "Toast bildirimi açılmalı");
      assert($("toast-text").textContent.includes("650"));
    });

    await test("Rapor indirme işlemi geçerli içerik üretir", async () => {
      const originalCreate = app.URL.createObjectURL;
      let generatedBlob = null;
      app.URL.createObjectURL = (blob) => { generatedBlob = blob; return "blob:test"; };
      try {
        $("converter-export-report").click();
        assert(generatedBlob, "Rapor Blob nesnesi üretilmedi");
        const reportContent = await generatedBlob.text();
        assert(reportContent.includes("VERİ ÖLÇÜ BİRİMİ DÖNÜŞTÜRME ANALİZ RAPORU"));
        assert(reportContent.includes("650"));
        assert(reportContent.includes("5.452.595.200"));
      } finally {
        app.URL.createObjectURL = originalCreate;
      }
    });
  }

  frame.addEventListener("load", () => {
    run().catch((err) => {
      document.getElementById("test-summary").textContent = "Test hatası: " + err.message;
      document.getElementById("test-summary").className = "fail";
    });
  });
})();
