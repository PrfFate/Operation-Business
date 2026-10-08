/**
 * @file converter-engine.js
 * @description Veri boyutu ve ölçü birimi dönüştürme motoru (Measurement Converter Engine).
 * SOLID prensiplerine ve Best Practice kurallarına uygun olarak tasarlanmıştır.
 * - SRP: Hesaplama stratejileri, birim tanımları ve biçimlendirme bağımsız sınıflara/nesnelere ayrılmıştır.
 * - OCP: Yeni ölçü birimleri veya dönüştürme stratejileri motor kodunu değiştirmeden eklenebilir.
 * - LSP & DIP: UI katmanı soyut motor sözleşmesine bağlıdır.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MeasurementConverterEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Desteklenen standartlar için Strateji arayüzü implementasyonları (Strategy Pattern)
   */
  class BinaryStrategy {
    constructor() {
      this.id = "binary";
      this.name = "İkili Standart (IEC / 1024)";
      this.base = 1024;
      this.description = "1 kB = 1.024 Byte, 1 MB = 1.024 kB (Windows, RAM, Telekomünikasyon standardı)";
    }

    getPower(powerIndex) {
      return Math.pow(this.base, powerIndex);
    }

    getUnitSymbol(unitKey) {
      const symbols = {
        b: "b",
        B: "B",
        kB: "kB",
        MB: "MB",
        GB: "GB",
        TB: "TB",
        PB: "PB"
      };
      return symbols[unitKey] || unitKey;
    }
  }

  class DecimalStrategy {
    constructor() {
      this.id = "decimal";
      this.name = "Ondalık Standart (SI / 1000)";
      this.base = 1000;
      this.description = "1 kB = 1.000 Byte, 1 MB = 1.000 kB (SI, Disk Üreticileri, macOS standardı)";
    }

    getPower(powerIndex) {
      return Math.pow(this.base, powerIndex);
    }

    getUnitSymbol(unitKey) {
      const symbols = {
        b: "b",
        B: "B",
        kB: "kB",
        MB: "MB",
        GB: "GB",
        TB: "TB",
        PB: "PB"
      };
      return symbols[unitKey] || unitKey;
    }
  }

  /**
   * Birim Tanımları Kayıt Defteri (Unit Registry)
   * Her birim için güç indeksi, ad, örnek değer ve açıklama barındırır.
   */
  const UNIT_DEFINITIONS = [
    {
      key: "b",
      name: "Bit",
      symbol: "b",
      powerIndex: -1, // Özel: 1 Byte = 8 Bit (b = B / 8)
      isBit: true,
      example: "5452595200",
      description: "En küçük ikili bilgi birimi (0 veya 1)",
      category: "İkili"
    },
    {
      key: "B",
      name: "Byte",
      symbol: "B",
      powerIndex: 0, // 1024^0 = 1 Byte
      isBit: false,
      example: "681574400",
      description: "8 bitten oluşan temel veri depolama birimi",
      category: "Bayt"
    },
    {
      key: "kB",
      name: "Kilobyte",
      symbol: "kB",
      powerIndex: 1, // 1024^1 veya 1000^1
      isBit: false,
      example: "665600",
      description: "Küçük metin dosyaları ve SMS yükleri",
      category: "Büyütülmüş"
    },
    {
      key: "MB",
      name: "Megabyte",
      symbol: "MB",
      powerIndex: 2, // 1024^2 veya 1000^2
      isBit: false,
      example: "650",
      description: "Fotoğraf, MP3 veya CD disk kapasitesi (650 MB)",
      category: "Büyütülmüş"
    },
    {
      key: "GB",
      name: "Gigabyte",
      symbol: "GB",
      powerIndex: 3, // 1024^3 veya 1000^3
      isBit: false,
      example: "0.6347",
      description: "Mobil internet paketleri ve veritabanı boyutları",
      category: "Büyütülmüş"
    },
    {
      key: "TB",
      name: "Terabyte",
      symbol: "TB",
      powerIndex: 4, // 1024^4 veya 1000^4
      isBit: false,
      example: "0.00062",
      description: "Sunucu depolama ve kurumsal yedekleme kapasiteleri",
      category: "Büyütülmüş"
    },
    {
      key: "PB",
      name: "Petabyte",
      symbol: "PB",
      powerIndex: 5, // 1024^5 veya 1000^5
      isBit: false,
      example: "0.0000006",
      description: "Büyük veri merkezleri ve bulut depolama",
      category: "Büyütülmüş"
    }
  ];

  /**
   * Sayı Biçimlendirici ve Ayrıştırıcı (Number Parser & Formatter Service)
   */
  class NumberFormatService {
    constructor() {
      this.trFormatter = new Intl.NumberFormat("tr-TR", {
        maximumFractionDigits: 10
      });
    }

    /**
     * Kullanıcının girdiği metni temiz ve geçerli bir sayıya çevirir.
     * Türkçe virgül desteği, boşluklar ve bilimsel gösterim desteklenir.
     * @param {string|number} rawValue
     * @returns {number|null}
     */
    parse(rawValue) {
      if (rawValue === null || rawValue === undefined) return null;
      if (typeof rawValue === "number") {
        return Number.isFinite(rawValue) ? rawValue : null;
      }

      let text = String(rawValue).trim();
      if (!text) return null;

      // Boşlukları ve gruplandırma işaretlerini temizle
      text = text.replace(/\s+/g, "");

      // Eğer hem nokta hem virgül varsa (örn: 1.000,50 veya 1,000.50)
      if (text.includes(".") && text.includes(",")) {
        if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
          // Türkçe format: 1.000,50 -> 1000.50
          text = text.replace(/\./g, "").replace(",", ".");
        } else {
          // İngilizce format: 1,000.50 -> 1000.50
          text = text.replace(/,/g, "");
        }
      } else if (text.includes(",")) {
        // Sadece virgül varsa: ondalık ayracı olarak kabul et
        text = text.replace(",", ".");
      }

      const parsed = Number(text);
      if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) {
        return null;
      }
      return parsed;
    }

    /**
     * Sayıyı istenen hassasiyet ve biçimde formatlar.
     * @param {number} value
     * @param {Object} options
     * @returns {string}
     */
    format(value, options = {}) {
      if (value === null || value === undefined || !Number.isFinite(value)) {
        return "";
      }

      const {
        useGrouping = true,
        maxFractionDigits = 8,
        exponentialThreshold = 1e15,
        minFractionDigits = 0
      } = options;

      if (value === 0) return "0";

      // Çok büyük veya çok küçük sayılar için bilimsel gösterim opsiyonu
      if (value >= exponentialThreshold || (value < 1e-7 && value > 0)) {
        return value.toExponential(4);
      }

      if (!useGrouping) {
        // Ham sayı gösterimi (kopyalama için ideal)
        const fixed = value.toFixed(maxFractionDigits);
        // Sondaki gereksiz sıfırları temizle
        return fixed.replace(/\.?0+$/, "");
      }

      // Standart biçimlendirme
      const formatter = new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: minFractionDigits,
        maximumFractionDigits: maxFractionDigits,
        useGrouping: true
      });
      return formatter.format(value);
    }
  }

  /**
   * Ana Dönüştürücü Motor Sınıfı (MeasurementConverterEngine)
   */
  class MeasurementConverterEngine {
    constructor() {
      this.strategies = {
        binary: new BinaryStrategy(),
        decimal: new DecimalStrategy()
      };
      this.numberService = new NumberFormatService();
      this.unitDefinitions = UNIT_DEFINITIONS;
    }

    /**
     * Strateji nesnesini döndürür
     * @param {string} standard 'binary' veya 'decimal'
     * @returns {BinaryStrategy|DecimalStrategy}
     */
    getStrategy(standard = "binary") {
      return this.strategies[standard] || this.strategies.binary;
    }

    /**
     * Tanımlı tüm birimleri döndürür
     */
    getUnits() {
      return this.unitDefinitions;
    }

    /**
     * Belirli bir birim anahtarına göre birim tanımını bulur
     * @param {string} unitKey
     */
    getUnit(unitKey) {
      return this.unitDefinitions.find((u) => u.key === unitKey) || null;
    }

    /**
     * Herhangi bir birimdeki değeri temel birim olan "Byte" cinsine çevirir.
     * @param {string} unitKey
     * @param {number} value
     * @param {string} standard 'binary' | 'decimal'
     * @returns {number}
     */
    toBaseBytes(unitKey, value, standard = "binary") {
      const unit = this.getUnit(unitKey);
      if (!unit) throw new Error("Bilinmeyen birim: " + unitKey);
      if (value === 0) return 0;

      const strategy = this.getStrategy(standard);

      if (unit.isBit) {
        // 1 Byte = 8 Bit -> Bytes = bits / 8
        return value / 8;
      }

      // Bytes = value * (base ^ powerIndex)
      const multiplier = strategy.getPower(unit.powerIndex);
      return value * multiplier;
    }

    /**
     * Temel birim olan "Byte" değerini hedef birime çevirir.
     * @param {string} targetUnitKey
     * @param {number} bytes
     * @param {string} standard 'binary' | 'decimal'
     * @returns {number}
     */
    fromBaseBytes(targetUnitKey, bytes, standard = "binary") {
      const unit = this.getUnit(targetUnitKey);
      if (!unit) throw new Error("Bilinmeyen birim: " + targetUnitKey);
      if (bytes === 0) return 0;

      const strategy = this.getStrategy(standard);

      if (unit.isBit) {
        // bits = bytes * 8
        return bytes * 8;
      }

      const divisor = strategy.getPower(unit.powerIndex);
      return bytes / divisor;
    }

    /**
     * Girdi alanından gelen değere göre tüm birimlerin karşılıklarını hesaplar.
     * @param {string} sourceUnitKey Değerin girildiği birim (örn: 'MB')
     * @param {string|number} rawValue Girilen ham metin veya sayı (örn: '650')
     * @param {string} standard 'binary' | 'decimal'
     * @returns {Object} Sonuç kümesi
     */
    convertAll(sourceUnitKey, rawValue, standard = "binary") {
      const parsedValue = this.numberService.parse(rawValue);

      if (parsedValue === null) {
        return {
          valid: false,
          sourceUnit: sourceUnitKey,
          rawValue: rawValue,
          standard: standard,
          values: {},
          formatted: {},
          metrics: null
        };
      }

      const strategy = this.getStrategy(standard);
      const totalBytes = this.toBaseBytes(sourceUnitKey, parsedValue, standard);
      const values = {};
      const formatted = {};
      const rawFormatted = {};

      this.unitDefinitions.forEach((unit) => {
        const val = this.fromBaseBytes(unit.key, totalBytes, standard);
        values[unit.key] = val;

        // Ondalık basamak hassasiyetini birim seviyesine göre ayarla
        let maxDecimals = 6;
        if (unit.key === "b" || unit.key === "B") {
          maxDecimals = 2;
        } else if (unit.key === "TB" || unit.key === "PB") {
          maxDecimals = 8;
        }

        formatted[unit.key] = this.numberService.format(val, {
          useGrouping: true,
          maxFractionDigits: maxDecimals
        });

        rawFormatted[unit.key] = this.numberService.format(val, {
          useGrouping: false,
          maxFractionDigits: maxDecimals
        });
      });

      // Telekom & Mesajlaşma sektör metrikleri (Kurumsal Değer)
      const metrics = this.calculateMetrics(totalBytes);

      return {
        valid: true,
        sourceUnit: sourceUnitKey,
        sourceValue: parsedValue,
        totalBytes: totalBytes,
        totalBits: totalBytes * 8,
        standard: standard,
        strategyInfo: {
          name: strategy.name,
          base: strategy.base,
          description: strategy.description
        },
        values: values,
        formatted: formatted,
        rawFormatted: rawFormatted,
        metrics: metrics
      };
    }

    /**
     * Verilen bayt boyutunun kurumsal telekom ve SMS karşılıklarını hesaplar.
     * (MesajLab vizyonu ile tam entegre katma değer)
     * @param {number} bytes
     * @returns {Object}
     */
    calculateMetrics(bytes) {
      const gsmSmsBytes = 140; // 1 standart GSM-7 SMS segmenti = 140 bayt (160 7-bit karakter)
      const ucs2SmsBytes = 70; // 1 UCS-2 (Türkçe/Unicode) segmenti = 70 bayt (35 16-bit karakter)
      const floppyDisk = 1.44 * 1024 * 1024; // 1.44 MB Disket
      const cdCapacity = 700 * 1024 * 1024; // 700 MB Standart CD

      const smsGsmCount = bytes > 0 ? Math.ceil(bytes / gsmSmsBytes) : 0;
      const smsUcs2Count = bytes > 0 ? Math.ceil(bytes / ucs2SmsBytes) : 0;

      return {
        smsGsmCount: smsGsmCount,
        smsUcs2Count: smsUcs2Count,
        floppyEquivalent: (bytes / floppyDisk).toFixed(1),
        cdEquivalent: (bytes / cdCapacity).toFixed(2),
        characterCountUtf8: Math.floor(bytes) // ASCII metin için ~ 1 bayt = 1 karakter
      };
    }

    /**
     * Sayı parse servisine erişim sağlar
     */
    parseNumber(value) {
      return this.numberService.parse(value);
    }

    /**
     * Sayı biçimlendirme servisine erişim sağlar
     */
    formatNumber(value, options) {
      return this.numberService.format(value, options);
    }
  }

  // Singleton motor örneği
  const engine = new MeasurementConverterEngine();
  engine.MeasurementConverterEngine = MeasurementConverterEngine;
  engine.BinaryStrategy = BinaryStrategy;
  engine.DecimalStrategy = DecimalStrategy;

  return engine;
});
