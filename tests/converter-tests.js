(function (root) {
  "use strict";

  function runConverterEngineTests() {
    const engine = root.MeasurementConverterEngine;
    const results = [];

    function assert(condition, message) {
      if (!condition) throw new Error(message || "Assertion failed");
    }
    function same(actual, expected) {
      assert(JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + " != " + JSON.stringify(expected));
    }
    function closeTo(actual, expected, delta = 1e-6) {
      assert(Math.abs(actual - expected) < delta, `Değer ${actual}, beklenen ${expected} değerine ${delta} toleransla eşit değil`);
    }
    function test(name, run) {
      try {
        run();
        results.push({ test: name, passed: true, error: "" });
      } catch (error) {
        results.push({ test: name, passed: false, error: error.message });
      }
    }

    test("Motor başarıyla yüklendi ve temel birim tanımları mevcut", function () {
      assert(engine, "Engine tanımlı olmalı");
      const units = engine.getUnits();
      assert(units.length >= 6, "En az 6 birim olmalı (b, B, kB, MB, GB, TB)");
      same(units.map(u => u.key), ["b", "B", "kB", "MB", "GB", "TB", "PB"]);
    });

    test("Kullanıcı görselindeki 650 MB örneği (İkili / 1024 Tabanı) tam bit hesabı doğrulaması", function () {
      const res = engine.convertAll("MB", 650, "binary");
      assert(res.valid, "Sonuç geçerli olmalı");
      same(res.values.b, 5452595200); // Görseldeki 5452595200 bit değeri!
      same(res.values.B, 681574400);   // 650 * 1024 * 1024
      same(res.values.kB, 665600);     // 650 * 1024
      same(res.values.MB, 650);
      closeTo(res.values.GB, 0.634765625);
    });

    test("Kullanıcı görselindeki 650 MB örneği (Ondalık / 1000 Tabanı) SI doğrulaması", function () {
      const res = engine.convertAll("MB", 650, "decimal");
      assert(res.valid, "Sonuç geçerli olmalı");
      same(res.values.b, 5200000000);
      same(res.values.B, 650000000);
      same(res.values.kB, 650000);     // Görseldeki 650000 kB değeri!
      same(res.values.MB, 650);
      same(res.values.GB, 0.65);
      same(res.values.TB, 0.00065);
    });

    test("Ters yönlü dönüşüm: Bit alanından (5452595200 b) MB hesaplama", function () {
      const res = engine.convertAll("b", 5452595200, "binary");
      assert(res.valid, "Sonuç geçerli olmalı");
      same(res.values.MB, 650);
      same(res.values.B, 681574400);
    });

    test("Ters yönlü dönüşüm: Byte alanından (140 B SMS segmenti) bit ve kB hesaplama", function () {
      const res = engine.convertAll("B", 140, "binary");
      assert(res.valid);
      same(res.values.b, 1120); // 140 * 8 = 1120 bit
      closeTo(res.values.kB, 140 / 1024);
    });

    test("Sayı ayrıştırma servisi (Türkçe format, virgül, boşluk desteği)", function () {
      same(engine.parseNumber("650"), 650);
      same(engine.parseNumber(" 1.000,50 "), 1000.5);
      same(engine.parseNumber("1,5"), 1.5);
      same(engine.parseNumber("1 000 000"), 1000000);
      same(engine.parseNumber("invalid-text"), null);
      same(engine.parseNumber("-50"), null); // Negatif boyut kabul edilmez
    });

    test("Telekomünikasyon ve SMS metrikleri hesaplama", function () {
      const metrics = engine.calculateMetrics(1400); // 10 standart SMS
      same(metrics.smsGsmCount, 10);
      same(metrics.smsUcs2Count, 20); // 70B'lik 20 adet Türkçe SMS
      same(metrics.characterCountUtf8, 1400);
    });

    test("Strateji Deseni (Strategy Pattern) doğrulaması", function () {
      const binStrategy = engine.getStrategy("binary");
      const decStrategy = engine.getStrategy("decimal");
      same(binStrategy.base, 1024);
      same(decStrategy.base, 1000);
      same(binStrategy.getPower(1), 1024);
      same(decStrategy.getPower(1), 1000);
    });

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    return { passed, failed, results };
  }

  root.runConverterEngineTests = runConverterEngineTests;
})(typeof self !== "undefined" ? self : this);
