/**
 * @file converter-ui.js
 * @description Veri boyutu ve ölçü birimi dönüştürme arayüz denetleyicisi (Measurement Converter UI).
 * SOLID ve DRY prensiplerine uygun:
 * - SRP: Sadece DOM olayları, görünüm senkronizasyonu ve kullanıcı etkileşimini yönetir.
 * - DRY: 6 farklı birim alanı için tekrar eden kodlar yerine birim kayıt listesi (registry)
 *   üzerinden tek merkezden dinamik bileşen ve olay yönetimi (Event Delegation) kullanılır.
 */

(function (root) {
  "use strict";

  const engine = root.MeasurementConverterEngine;
  if (!engine) {
    console.error("MeasurementConverterEngine yüklenemedi!");
    return;
  }

  class MeasurementConverterUI {
    constructor() {
      this.activeUnit = "MB";
      this.currentStandard = "binary"; // 'binary' (1024) veya 'decimal' (1000)
      this.useGrouping = true; // Biçimlendirilmiş (1.000,00) vs Ham Sayı (1000)
      this.lastConversionResult = null;
      this.isUpdating = false;

      this.elements = {};
      this.inputMap = new Map();
      this.unitRows = new Map();

      this.init();
    }

    /**
     * DOM elemanlarını bağlar ve dinleyicileri başlatır
     */
    init() {
      this.cacheDom();
      this.renderUnitRows();
      this.bindEvents();
      this.loadPreset("650", "MB"); // Kullanıcının paylaştığı görseldeki başlangıç örneği
    }

    /**
     * Statik DOM referanslarını önbelleğe alır
     */
    cacheDom() {
      this.elements.container = document.getElementById("converter-rows-container");
      this.elements.standardToggleBinary = document.getElementById("converter-std-binary");
      this.elements.standardToggleDecimal = document.getElementById("converter-std-decimal");
      this.elements.formatToggle = document.getElementById("converter-format-toggle");
      this.elements.clearButton = document.getElementById("converter-clear-all");
      this.elements.exampleButton = document.getElementById("converter-load-example");
      this.elements.exportButton = document.getElementById("converter-export-report");

      // Özet Kartları
      this.elements.activeUnitTitle = document.getElementById("converter-active-unit-title");
      this.elements.activeUnitDetail = document.getElementById("converter-active-unit-detail");
      this.elements.standardTitle = document.getElementById("converter-standard-title");
      this.elements.standardDetail = document.getElementById("converter-standard-detail");
      this.elements.telcoTitle = document.getElementById("converter-telco-title");
      this.elements.telcoDetail = document.getElementById("converter-telco-detail");
      this.elements.telcoProgress = document.getElementById("converter-telco-progress");

      // Toast bildirimi (ortak arayüz bileşeni)
      this.elements.toast = document.getElementById("toast");
      this.elements.toastText = document.getElementById("toast-text");
    }

    /**
     * DRY Prensibi: HTML şablonunu tekrar tekrar yazmak yerine,
     * motorun birim tanımlarından kurumsal satırları dinamik oluşturur.
     */
    renderUnitRows() {
      if (!this.elements.container) return;

      const units = engine.getUnits();
      const fragment = document.createDocumentFragment();

      units.forEach((unit) => {
        const row = document.createElement("article");
        row.className = "converter-row-card";
        row.dataset.unitKey = unit.key;

        row.innerHTML = `
          <div class="converter-row-header">
            <div class="converter-badge-group">
              <span class="converter-unit-symbol ${unit.isBit ? 'symbol-bit' : ''}">${unit.symbol}</span>
              <div class="converter-label-wrap">
                <label for="converter-input-${unit.key}" class="converter-unit-name">
                  ${unit.name}
                </label>
                <span class="converter-unit-desc">${unit.description}</span>
              </div>
            </div>
          </div>

          <div class="converter-input-wrapper">
            <input
              type="text"
              id="converter-input-${unit.key}"
              class="converter-input"
              data-unit="${unit.key}"
              placeholder="Örnek: ${unit.example}"
              autocomplete="off"
              spellcheck="false"
              inputmode="decimal"
              aria-label="${unit.name} (${unit.symbol})"
            />
            <div class="converter-input-actions">
              <button
                type="button"
                class="icon-button converter-copy-btn"
                data-copy-unit="${unit.key}"
                title="${unit.name} değerini panoya kopyala"
                aria-label="${unit.name} değerini panoya kopyala"
              >
                <svg class="icon small"><use href="#i-copy"/></svg>
              </button>
            </div>
          </div>
          <div class="converter-row-hint" id="converter-hint-${unit.key}"></div>
        `;

        const input = row.querySelector(`[data-unit="${unit.key}"]`);
        this.inputMap.set(unit.key, input);
        this.unitRows.set(unit.key, row);
        fragment.appendChild(row);
      });

      this.elements.container.replaceChildren(fragment);
    }

    /**
     * Olay dinleyicilerini bağlar (Event Delegation & DRY)
     */
    bindEvents() {
      // 1. Girdi Dinleyicisi (Tek merkezden tüm input alanları kontrol edilir)
      this.elements.container.addEventListener("input", (event) => {
        const input = event.target.closest(".converter-input");
        if (!input) return;

        const unitKey = input.dataset.unit;
        this.handleInputChange(unitKey, input.value);
      });

      // 2. Kopyalama Butonları Dinleyicisi (Event Delegation)
      this.elements.container.addEventListener("click", (event) => {
        const copyBtn = event.target.closest("[data-copy-unit]");
        if (!copyBtn) return;

        const unitKey = copyBtn.dataset.copyUnit;
        this.copyUnitValue(unitKey, copyBtn);
      });

      // 3. Standart Değiştirme (İkili 1024 vs Ondalık 1000)
      if (this.elements.standardToggleBinary) {
        this.elements.standardToggleBinary.addEventListener("click", () => {
          this.setStandard("binary");
        });
      }
      if (this.elements.standardToggleDecimal) {
        this.elements.standardToggleDecimal.addEventListener("click", () => {
          this.setStandard("decimal");
        });
      }

      // 4. Format Değiştirme (Biçimli vs Ham Sayı)
      if (this.elements.formatToggle) {
        this.elements.formatToggle.addEventListener("change", (e) => {
          this.useGrouping = e.target.checked;
          this.refreshAllDisplayValues();
        });
      }

      // 5. Temizle Butonu
      if (this.elements.clearButton) {
        this.elements.clearButton.addEventListener("click", () => {
          this.clearAll();
        });
      }

      // 6. Örnek Yükle Butonu (Görseldeki 650 MB)
      if (this.elements.exampleButton) {
        this.elements.exampleButton.addEventListener("click", () => {
          this.loadPreset("650", "MB");
          this.showToast("Görseldeki 650 MB örneği başarıyla yüklendi.");
        });
      }

      // 7. Rapor İndir Butonu
      if (this.elements.exportButton) {
        this.elements.exportButton.addEventListener("click", () => {
          this.exportReport();
        });
      }

      // 8. Hızlı Hazır Değer Çipleri (Presets)
      document.querySelectorAll("[data-preset-value]").forEach((presetBtn) => {
        presetBtn.addEventListener("click", () => {
          const val = presetBtn.dataset.presetValue;
          const unit = presetBtn.dataset.presetUnit || "MB";
          this.loadPreset(val, unit);
          this.showToast(`${val} ${unit} hazır değeri yüklendi.`);
        });
      });
    }

    /**
     * Kullanıcı herhangi bir girdi alanına yazdığında çalışır
     */
    handleInputChange(unitKey, rawValue) {
      if (this.isUpdating) return;
      this.activeUnit = unitKey;

      if (!rawValue || !rawValue.trim()) {
        this.clearOtherInputs(unitKey);
        this.updateActiveCardHighlight(unitKey);
        this.updateSummaryEmpty();
        return;
      }

      const result = engine.convertAll(unitKey, rawValue, this.currentStandard);
      this.lastConversionResult = result;

      if (!result.valid) {
        this.markInputInvalid(unitKey, true);
        return;
      }

      this.markInputInvalid(unitKey, false);
      this.updateOtherInputs(unitKey, result);
      this.updateActiveCardHighlight(unitKey);
      this.updateSummaryCards(result);
    }

    /**
     * Aktif girdi dışındaki tüm alanları hesaplanan değerlerle doldurur
     */
    updateOtherInputs(sourceUnitKey, result) {
      this.isUpdating = true;
      try {
        const valuesToDisplay = this.useGrouping ? result.formatted : result.rawFormatted;

        this.inputMap.forEach((input, key) => {
          if (key !== sourceUnitKey) {
            input.value = valuesToDisplay[key] || "";
          }

          // Satır altı bilgi ipucu (Örn: ~ 681 Milyon karakter)
          const hint = document.getElementById(`converter-hint-${key}`);
          if (hint) {
            if (key === "b") {
              hint.textContent = `Toplam ${result.formatted.b} ikili bit sinyali`;
            } else if (key === "B") {
              hint.textContent = `~ ${result.metrics ? engine.formatNumber(result.metrics.characterCountUtf8, { useGrouping: true }) : 0} UTF-8 karakter hacmi`;
            } else if (key === "MB") {
              hint.textContent = `~ ${result.metrics ? result.metrics.cdEquivalent : 0} adet Standart CD (700 MB)`;
            } else {
              hint.textContent = "";
            }
          }
        });
      } finally {
        this.isUpdating = false;
      }
    }

    /**
     * Girdiyi geçersiz/hata olarak işaretler
     */
    markInputInvalid(unitKey, isInvalid) {
      const input = this.inputMap.get(unitKey);
      if (input) {
        input.classList.toggle("is-invalid", isInvalid);
      }
    }

    /**
     * Aktif odaklanan veya yazılan birim kartını görsel olarak vurgular
     */
    updateActiveCardHighlight(activeUnitKey) {
      this.unitRows.forEach((card, key) => {
        card.classList.toggle("is-active-source", key === activeUnitKey);
      });
    }

    /**
     * Standart değiştirildiğinde (İkili 1024 <-> Ondalık 1000)
     */
    setStandard(standard) {
      if (this.currentStandard === standard) return;
      this.currentStandard = standard;

      if (this.elements.standardToggleBinary) {
        this.elements.standardToggleBinary.classList.toggle("active", standard === "binary");
        this.elements.standardToggleBinary.setAttribute("aria-pressed", String(standard === "binary"));
      }
      if (this.elements.standardToggleDecimal) {
        this.elements.standardToggleDecimal.classList.toggle("active", standard === "decimal");
        this.elements.standardToggleDecimal.setAttribute("aria-pressed", String(standard === "decimal"));
      }

      // Mevcut aktif alandaki değer üzerinden tüm hesaplamayı yeniden çalıştır
      const activeInput = this.inputMap.get(this.activeUnit);
      if (activeInput && activeInput.value.trim()) {
        this.handleInputChange(this.activeUnit, activeInput.value);
        this.showToast(`Hesaplama standardı: ${standard === "binary" ? "İkili (1024 B / IEC)" : "Ondalık (1000 B / SI)"} olarak güncellendi.`);
      }
    }

    /**
     * Format (Biçimli vs Ham) değiştirildiğinde mevcut değerleri yeniden yansıtır
     */
    refreshAllDisplayValues() {
      if (!this.lastConversionResult || !this.lastConversionResult.valid) return;
      const valuesToDisplay = this.useGrouping
        ? this.lastConversionResult.formatted
        : this.lastConversionResult.rawFormatted;

      this.isUpdating = true;
      try {
        this.inputMap.forEach((input, key) => {
          input.value = valuesToDisplay[key] || "";
        });
      } finally {
        this.isUpdating = false;
      }
    }

    /**
     * Kurumsal Özet Kartlarını (Summary Grid) günceller
     */
    updateSummaryCards(result) {
      const unitObj = engine.getUnit(result.sourceUnit);
      const unitName = unitObj ? unitObj.name : result.sourceUnit;

      if (this.elements.activeUnitTitle) {
        this.elements.activeUnitTitle.textContent = `${engine.formatNumber(result.sourceValue, { useGrouping: true })} ${unitObj ? unitObj.symbol : ""}`;
      }
      if (this.elements.activeUnitDetail) {
        this.elements.activeUnitDetail.textContent = `Aktif kaynak: ${unitName} (${result.formatted.B} Bayt)`;
      }

      if (this.elements.standardTitle) {
        this.elements.standardTitle.textContent = result.strategyInfo.name;
      }
      if (this.elements.standardDetail) {
        this.elements.standardDetail.textContent = `Taban çarpan: ${result.strategyInfo.base} · ${result.strategyInfo.description}`;
      }

      if (this.elements.telcoTitle && result.metrics) {
        this.elements.telcoTitle.textContent = `${engine.formatNumber(result.metrics.smsGsmCount, { useGrouping: true })} SMS`;
      }
      if (this.elements.telcoDetail && result.metrics) {
        this.elements.telcoDetail.textContent = `Standart GSM segmenti (140B) · Türkçe: ${engine.formatNumber(result.metrics.smsUcs2Count, { useGrouping: true })} SMS`;
      }
      if (this.elements.telcoProgress) {
        // Görsel canlı çubuk
        this.elements.telcoProgress.style.width = Math.min(100, Math.max(10, Math.log10(result.totalBytes + 1) * 10)) + "%";
      }

      if (this.elements.exportButton) {
        this.elements.exportButton.disabled = false;
      }
      if (this.elements.clearButton) {
        this.elements.clearButton.disabled = false;
      }
    }

    /**
     * Boş durumda özet kartlarını sıfırlar
     */
    updateSummaryEmpty() {
      if (this.elements.activeUnitTitle) this.elements.activeUnitTitle.textContent = "Girdi Bekleniyor";
      if (this.elements.activeUnitDetail) this.elements.activeUnitDetail.textContent = "Dönüştürmek için bir alana sayı yazın";
      if (this.elements.standardTitle) this.elements.standardTitle.textContent = this.currentStandard === "binary" ? "İkili (1024 / IEC)" : "Ondalık (1000 / SI)";
      if (this.elements.standardDetail) this.elements.standardDetail.textContent = "1 kB = 1.024 Byte (Standart mod)";
      if (this.elements.telcoTitle) this.elements.telcoTitle.textContent = "—";
      if (this.elements.telcoDetail) this.elements.telcoDetail.textContent = "SMS ve veri kapasitesi hesaplanacak";
      if (this.elements.telcoProgress) this.elements.telcoProgress.style.width = "0%";
      if (this.elements.exportButton) this.elements.exportButton.disabled = true;
    }

    /**
     * Belirli bir değeri panoya kopyalar
     */
    async copyUnitValue(unitKey, btnElement) {
      const input = this.inputMap.get(unitKey);
      if (!input || !input.value.trim()) {
        this.showToast("Kopyalanacak bir değer bulunamadı.");
        return;
      }

      const textToCopy = input.value.trim();
      const unitObj = engine.getUnit(unitKey);
      const unitSymbol = unitObj ? unitObj.symbol : unitKey;

      try {
        await navigator.clipboard.writeText(textToCopy);
        this.showToast(`Kopyalandı: ${textToCopy} ${unitSymbol}`);

        // Görsel geri bildirim efekti
        if (btnElement) {
          btnElement.classList.add("copied");
          setTimeout(() => btnElement.classList.remove("copied"), 1500);
        }
      } catch (err) {
        // Eski tarayıcı fallback'i
        input.select();
        document.execCommand("copy");
        this.showToast(`Kopyalandı: ${textToCopy} ${unitSymbol}`);
      }
    }

    /**
     * Önceden tanımlı bir değeri yükler (Preset)
     */
    loadPreset(value, unitKey) {
      this.activeUnit = unitKey;
      const input = this.inputMap.get(unitKey);
      if (input) {
        input.value = value;
        this.handleInputChange(unitKey, value);
        input.focus();
      }
    }

    /**
     * Tüm alanları sıfırlar
     */
    clearAll() {
      this.isUpdating = true;
      try {
        this.inputMap.forEach((input) => {
          input.value = "";
          input.classList.remove("is-invalid");
        });
        document.querySelectorAll(".converter-row-hint").forEach((hint) => {
          hint.textContent = "";
        });
        this.updateActiveCardHighlight(null);
        this.updateSummaryEmpty();
        this.lastConversionResult = null;
        if (this.elements.clearButton) this.elements.clearButton.disabled = true;

        const firstInput = this.inputMap.get("MB") || this.inputMap.get("b");
        if (firstInput) firstInput.focus();

        this.showToast("Tüm dönüştürme alanları temizlendi.");
      } finally {
        this.isUpdating = false;
      }
    }

    /**
     * Diğer girdi alanlarını temizler
     */
    clearOtherInputs(exceptKey) {
      this.isUpdating = true;
      try {
        this.inputMap.forEach((input, key) => {
          if (key !== exceptKey) {
            input.value = "";
          }
        });
        document.querySelectorAll(".converter-row-hint").forEach((hint) => {
          hint.textContent = "";
        });
      } finally {
        this.isUpdating = false;
      }
    }

    /**
     * Hesaplama sonuçlarını içeren kurumsal TXT raporu indirir
     */
    exportReport() {
      if (!this.lastConversionResult || !this.lastConversionResult.valid) {
        this.showToast("Dışa aktarılacak geçerli bir analiz bulunamadı.");
        return;
      }

      const res = this.lastConversionResult;
      const date = new Date().toLocaleString("tr-TR");

      const lines = [
        "===========================================================",
        "OPERASYON MERKEZİ · VERİ ÖLÇÜ BİRİMİ DÖNÜŞTÜRME ANALİZ RAPORU",
        "===========================================================",
        `Tarih / Saat         : ${date}`,
        `Hesaplanan Değer     : ${engine.formatNumber(res.sourceValue, { useGrouping: true })} ${res.sourceUnit}`,
        `Kullanılan Standart  : ${res.strategyInfo.name}`,
        `Standart Açıklaması  : ${res.strategyInfo.description}`,
        "-----------------------------------------------------------",
        "TÜM BİRİM KARŞILIKLARI",
        "-----------------------------------------------------------"
      ];

      engine.getUnits().forEach((u) => {
        const valFormatted = res.formatted[u.key];
        const valRaw = res.rawFormatted[u.key];
        lines.push(`${u.name.padEnd(12)} (${u.symbol.padEnd(3)}) : ${valFormatted} (Ham: ${valRaw})`);
      });

      if (res.metrics) {
        lines.push("-----------------------------------------------------------");
        lines.push("TELEKOMÜNİKASYON VE KAPASİTE METRİKLERİ");
        lines.push("-----------------------------------------------------------");
        lines.push(`Standart GSM-7 SMS (140B)      : ${engine.formatNumber(res.metrics.smsGsmCount, { useGrouping: true })} SMS`);
        lines.push(`Türkçe Unicode SMS (70B)       : ${engine.formatNumber(res.metrics.smsUcs2Count, { useGrouping: true })} SMS`);
        lines.push(`Eşdeğer CD Kapasitesi (700MB)  : ~ ${res.metrics.cdEquivalent} Adet`);
        lines.push(`UTF-8 Metin Karakter Hacmi     : ~ ${engine.formatNumber(res.metrics.characterCountUtf8, { useGrouping: true })} Karakter`);
      }

      lines.push("===========================================================");
      lines.push("Bu rapor Operasyon Merkezi tarafından üretilmiştir.");
      lines.push("Hiçbir veriniz sunucuya iletilmez, tüm hesaplamalar tarayıcınızda yapılır.");

      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `olcu-donusturme-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.showToast("Dönüştürme raporu başarıyla indirildi.");
    }

    /**
     * Toast mesajı gösterir
     */
    showToast(message) {
      if (!this.elements.toast || !this.elements.toastText) return;
      this.elements.toastText.textContent = message;
      this.elements.toast.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.elements.toast.hidden = true;
      }, 3500);
    }
  }

  // DOM hazır olduğunda başlat
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      root.MeasurementConverterUI = new MeasurementConverterUI();
    });
  } else {
    root.MeasurementConverterUI = new MeasurementConverterUI();
  }
})(typeof self !== "undefined" ? self : this);
