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
    const text = (id) => $(id).textContent;
    const event = (type) => new app.Event(type, { bubbles: true });
    const flush = () => doc.dispatchEvent(new app.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    function setValues(left, right) {
      $("left-text").value = left;
      $("right-text").value = right;
      $("left-text").dispatchEvent(event("input"));
      $("right-text").dispatchEvent(event("input"));
      flush();
    }
    function option(id, checked) { $(id).checked = checked; $(id).dispatchEvent(event("change")); }
    function filter(side) { $("side-filter").value = side; $("side-filter").dispatchEvent(event("change")); }
    const action = (side, name) => doc.querySelector('[data-side="' + side + '"][data-action="' + name + '"]');
    const rows = () => [...$("character-table-body").querySelectorAll("tr")];
    async function captureReport() {
      const originalCreate = app.URL.createObjectURL;
      const originalRevoke = app.URL.revokeObjectURL;
      const originalClick = app.HTMLAnchorElement.prototype.click;
      let reportBlob = null;
      let downloadName = null;
      app.URL.createObjectURL = (blob) => { reportBlob = blob; return "blob:sms-test"; };
      app.URL.revokeObjectURL = () => {};
      app.HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };
      try {
        $("export-report").click();
        assert(reportBlob, "No report Blob created");
        return { report: await reportBlob.text(), downloadName };
      } finally {
        app.URL.createObjectURL = originalCreate;
        app.URL.revokeObjectURL = originalRevoke;
        app.HTMLAnchorElement.prototype.click = originalClick;
      }
    }
    const errors = [];
    app.addEventListener("error", (error) => errors.push(error.message));
    app.addEventListener("unhandledrejection", (error) => errors.push(String(error.reason)));
    async function test(name, fn) {
      try { await fn(); results.push({ name, passed: true, error: "" }); }
      catch (error) { results.push({ name, passed: false, error: error.message }); }
      document.getElementById("test-results").textContent = results.map((entry) => (entry.passed ? "✓ " : "✗ ") + entry.name + (entry.error ? "\n  " + entry.error : "")).join("\n");
    }

    await test("Initial state is empty and actions are disabled", () => {
      assert(app.SmsEngine, "Engine not loaded");
      same(text("equality-title"), "Karşılaştırmaya hazır");
      same([$("left-text").value, $("right-text").value], ["", ""]);
      assert($("clear-all").disabled && $("export-report").disabled && $("swap-texts").disabled);
      assert(action("left", "copy").disabled && action("right", "clear").disabled);
    });
    await test("Sample produces non-ASCII warnings and difference highlights", () => {
      $("load-example").click();
      same(text("equality-title"), "Metinler farklı");
      assert($("left-text").value.startsWith("Merhaba Deniz"));
      assert($("right-text").value.includes("4829"));
      assert($("left-highlight").querySelector("mark.removed"));
      assert($("right-highlight").querySelector("mark.added"));
      same(text("left-ascii"), "ASCII uyumlu");
      assert(rows().length > 0);
      assert(!$("clear-all").disabled && !$("export-report").disabled);
    });
    await test("Live typing updates automatically after debounce", async () => {
      $("left-text").value = "Merhaba 123";
      $("right-text").value = "Merhaba 123";
      $("left-text").dispatchEvent(event("input"));
      $("right-text").dispatchEvent(event("input"));
      await delay(150);
      same(text("equality-title"), "Metinler birebir aynı");
      same(text("similarity-title"), "%100");
      same(text("left-characters"), "11");
      same(text("left-encoding"), "GSM-7");
      same(text("left-segments"), "1");
      same(rows().length, 0);
    });
    await test("Clearing one side leaves the other side and resets comparison", () => {
      action("right", "clear").click();
      same($("left-text").value, "Merhaba 123");
      same($("right-text").value, "");
      same(text("equality-title"), "Sağ metin bekleniyor");
      same(text("similarity-title"), "—");
      assert(!$("left-highlight").querySelector("mark"));
      assert(doc.activeElement === $("right-text"));
    });
    await test("Swap transfers both values and corresponding analysis", () => {
      setValues("ASCII", "İstanbul");
      $("swap-texts").click();
      same([$("left-text").value, $("right-text").value], ["İstanbul", "ASCII"]);
      same([text("left-encoding"), text("right-encoding")], ["Unicode", "GSM-7"]);
      same(text("right-ascii"), "ASCII uyumlu");
    });
    await test("Ignore options use Turkish case rules but preserve raw overlays", () => {
      const left = " İSTANBUL\n IŞIK\u00a0";
      setValues(left, "istanbulışık");
      option("ignore-whitespace", true);
      option("ignore-case", true);
      same(text("equality-title"), "Ayarlara göre eşit");
      same($("left-highlight").textContent, left + "\n");
      assert(!$("comparison-note").hidden);
      assert($("left-highlight").querySelector("mark"));
      setValues("I", "i");
      same(text("equality-title"), "Metinler farklı");
      option("ignore-whitespace", false);
      option("ignore-case", false);
    });
    await test("Highlight toggle changes overlays without changing inputs or results", () => {
      setValues("ABx", "ABy");
      option("highlight-differences", false);
      same($("left-highlight").textContent, "");
      same($("right-highlight").textContent, "");
      same($("left-text").value, "ABx");
      same(text("equality-title"), "Metinler farklı");
      option("highlight-differences", true);
      same($("left-highlight").querySelector("mark").textContent, "x");
    });
    await test("Non-ASCII table shows Unicode code points and exact positions", () => {
      setValues("ağ😀", "aö");
      same([text("left-characters"), text("left-length"), text("left-bytes")], ["3", "4", "7"]);
      same(text("nonascii-count"), "3");
      same(rows().length, 3);
      assert(rows()[1].textContent.includes("U+1F600"));
      assert(rows()[1].textContent.includes("3. karakter"));
      same([text("left-encoding"), text("right-encoding")], ["Unicode", "GSM-7"]);
    });
    await test("Side filter updates rows and issue counts", () => {
      filter("right");
      same(rows().length, 1);
      same(text("nonascii-count"), "1");
      assert(rows()[0].textContent.includes("Sağ metin"));
      filter("left");
      same(rows().length, 2);
      assert(rows().every((row) => row.textContent.includes("Sol metin")));
      filter("both");
    });
    await test("Control tab and keyboard navigation expose invisible text", () => {
      setValues("A\tB\n\u200b", "A\u00a0B");
      $("tab-invisible").click();
      same(rows().length, 4);
      same(text("invisible-count"), "4");
      same(text("issue-count"), "4");
      assert(rows().some((row) => row.textContent.includes("TAB")));
      same($("character-panel").getAttribute("aria-labelledby"), "tab-invisible");
      $("tab-invisible").dispatchEvent(new app.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      same($("tab-nonascii").getAttribute("aria-selected"), "true");
      assert(doc.activeElement === $("tab-nonascii"));
      same(rows().length, 2);
    });
    await test("Help and guide dialogs open, explain rules and close", () => {
      doc.querySelector('[data-dialog="guide"]').click();
      assert($("info-dialog").open);
      assert($("dialog-content").textContent.includes("GSM-7"));
      $("dialog-done").click();
      assert(!$("info-dialog").open);
      doc.querySelector('[data-dialog="help"]').click();
      assert($("info-dialog").open);
      assert($("dialog-content").textContent.includes("CRLF"));
      $("close-dialog").click();
      assert(!$("info-dialog").open);
    });
    await test("User HTML remains text and cannot insert executable elements", async () => {
      const payload = '<img src=x onerror="window.__smsXss=1"><svg onload="window.__smsXss=2">ğ';
      setValues(payload, "safe");
      await delay(20);
      same($("left-highlight").textContent, payload + "\n");
      assert(!$("left-highlight").querySelector("img,svg,script"));
      assert(!app.__smsXss);
      assert(!$("character-table-body").querySelector("img,svg,script"));
    });

    const originalClipboard = Object.getOwnPropertyDescriptor(app.navigator, "clipboard");
    const fakeClipboard = { readText: async () => "", writeText: async () => {} };
    Object.defineProperty(app.navigator, "clipboard", { configurable: true, value: fakeClipboard });
    try {
      await test("Copy passes exact SMS text to clipboard API", async () => {
        setValues("Kopya\nğ😀 ", "other");
        let copied = null;
        fakeClipboard.writeText = async (value) => { copied = value; };
        action("left", "copy").click();
        await delay(0);
        same(copied, "Kopya\nğ😀 ");
        assert(text("toast-text").includes("kopyalandı"));
      });
      await test("Copy and paste permission failures provide keyboard fallbacks", async () => {
        fakeClipboard.writeText = async () => { throw new Error("permission denied"); };
        fakeClipboard.readText = async () => { throw new Error("permission denied"); };
        action("left", "copy").click();
        await delay(0);
        same([$("left-text").selectionStart, $("left-text").selectionEnd], [0, $("left-text").value.length]);
        assert(text("toast-text").includes("Ctrl+C"));
        action("right", "paste").click();
        await delay(0);
        assert(doc.activeElement === $("right-text"));
        assert(text("toast-text").includes("Ctrl+V"));
      });
      await test("Paste updates analysis and safely truncates oversized surrogate pairs", async () => {
        fakeClipboard.readText = async () => "a".repeat(9999) + "😀";
        action("right", "paste").click();
        await delay(0);
        same($("right-text").value.length, 9999);
        assert(!/[\uD800-\uDBFF]$/.test($("right-text").value));
        same(text("right-length"), "9.999");
        assert(text("toast-text").includes("kısaltıldı"));
        fakeClipboard.readText = async () => "";
        action("right", "paste").click();
        await delay(0);
        same($("right-text").value.length, 9999);
        assert(text("toast-text").includes("bulunamadı"));
      });
    } finally {
      if (originalClipboard) Object.defineProperty(app.navigator, "clipboard", originalClipboard);
      else delete app.navigator.clipboard;
    }
    await test("One change in 10000 characters never displays exact 100 percent in UI or report", async () => {
      setValues("a".repeat(9999) + "x", "a".repeat(9999) + "y");
      same(text("equality-title"), "Metinler farklı");
      same(text("similarity-title"), "< %100");
      same($("left-highlight").querySelector("mark").textContent, "x");
      same($("right-highlight").querySelector("mark").textContent, "y");
      const { report } = await captureReport();
      assert(report.includes("Benzerlik: < %100"));
    });
    await test("Large differences report approximate highlighting and retain exact equality", () => {
      setValues("a".repeat(10000), "b".repeat(10000));
      same(text("equality-title"), "Metinler farklı");
      assert(text("equality-detail").startsWith("Yaklaşık"));
      assert(text("similarity-title").includes("≈"));
      assert(!$("comparison-note").hidden);
      same($("left-highlight").textContent.length, 10001);
    });
    await test("Character table caps visible rows while retaining full counts", () => {
      setValues("ğ".repeat(150), "test");
      $("tab-nonascii").click();
      filter("both");
      same(rows().length, 100);
      same(text("nonascii-count"), "150");
      assert(!$("table-limit-note").hidden);
      assert(text("table-limit-note").includes("150"));
    });
    await test("Report contains exact text and full issue list beyond table limit", async () => {
      const { report, downloadName } = await captureReport();
      assert(downloadName.startsWith("sms-karsilastirma-"));
      assert(report.includes("ğ".repeat(150)));
      assert(report.includes("150. karakter | ğ | U+011F"));
      assert(report.includes("ASCII uyumluluğu ve GSM-7 kodlaması farklıdır"));
      assert(report.includes("CRLF"));
    });
    await test("Collapsing the sidebar expands editors and preserves their values", async () => {
      const before = $("left-text").value;
      const toggle = $("sidebar-toggle");
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      await delay(240);
      const expandedWidth = $("left-card").getBoundingClientRect().width;
      toggle.click();
      await delay(240);
      same(toggle.getAttribute("aria-expanded"), "false");
      assert($("left-card").getBoundingClientRect().width > expandedWidth + 60);
      same($("left-text").value, before);
      const bounds = toggle.getBoundingClientRect();
      assert(Math.abs(bounds.top + bounds.height / 2 - app.innerHeight / 2) < 1);
      toggle.click();
      await delay(240);
      same(toggle.getAttribute("aria-expanded"), "true");
    });
    await test("All tool links update the view and application title without losing inputs", () => {
      const before = $("left-text").value;
      for (const view of ["xml", "converter", "fee", "sms"]) {
        const link = doc.querySelector('.navigation [data-view-link="' + view + '"]');
        link.click();
        assert(!$(view + "-view").hidden);
        same(doc.querySelectorAll(".workspace-view:not([hidden])").length, 1);
        same(link.getAttribute("aria-current"), "page");
        assert(doc.title.endsWith("Operasyon Merkezi"));
      }
      same($("left-text").value, before);
    });
    for (const width of [390, 320]) {
      await test("Mobile " + width + "px viewport has no page overflow and stacked usable editors", async () => {
        frame.style.width = width + "px";
        $("load-example").click();
        await delay(40);
        same(app.innerWidth, width);
        const actualWidth = doc.documentElement.scrollWidth;
        const overflowing = [...doc.querySelectorAll("body *")].filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.right > width + 1 && !element.closest(".table-wrapper");
        }).slice(0, 6).map((element) => element.id || element.className || element.tagName);
        assert(actualWidth <= width, "Page width " + actualWidth + " > viewport " + width + "; overflowing: " + overflowing.join(", "));
        const leftBounds = $("left-card").getBoundingClientRect();
        const rightBounds = $("right-card").getBoundingClientRect();
        assert(rightBounds.top > leftBounds.bottom, "Editors are not stacked");
        assert($("left-text").clientWidth > 200, "Editor is too narrow");
      });
      await test("Mobile " + width + "px menu supports open, navigation and Escape", async () => {
        const toggle = $("sidebar-toggle");
        same(toggle.getAttribute("aria-expanded"), "false");
        assert($("sidebar").inert);
        toggle.click();
        await delay(240);
        assert(!$("sidebar").inert && !$("sidebar-backdrop").hidden);
        assert(doc.querySelector(".app-shell").inert);
        doc.querySelector('.navigation [data-view-link="fee"]').click();
        same(toggle.getAttribute("aria-expanded"), "false");
        assert(!$("fee-view").hidden && !doc.querySelector(".app-shell").inert);
        toggle.click();
        doc.dispatchEvent(new app.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        same(toggle.getAttribute("aria-expanded"), "false");
        assert(doc.activeElement === toggle);
        toggle.click();
        doc.querySelector('.navigation [data-view-link="sms"]').click();
      });
    }
    frame.style.width = "1440px";
    await test("Clear all resets values, analysis, disabled actions and focus", () => {
      $("clear-all").click();
      same([$("left-text").value, $("right-text").value], ["", ""]);
      same(text("equality-title"), "Karşılaştırmaya hazır");
      same(text("issue-count"), "0");
      assert($("export-report").disabled && $("clear-all").disabled && $("swap-texts").disabled);
      assert($("analysis-empty").hidden === false);
      assert(doc.activeElement === $("left-text"));
    });
    await test("No runtime errors or unhandled rejections occurred", () => same(errors, []));
    finish();
  }

  function finish(error) {
    if (error) results.push({ name: "Test harness", passed: false, error: error.message || String(error) });
    const passed = results.filter((entry) => entry.passed).length;
    const failed = results.length - passed;
    document.getElementById("test-summary").textContent = passed + " başarılı, " + failed + " başarısız.";
    document.getElementById("test-summary").className = failed ? "fail" : "pass";
    document.getElementById("test-results").textContent = results.map((entry) => (entry.passed ? "✓ " : "✗ ") + entry.name + (entry.error ? "\n  " + entry.error : "")).join("\n");
    document.documentElement.dataset.testResult = failed ? "failed" : "passed";
    window.uiTestReport = { passed, failed, results };
    console.table(results);
  }
  frame.addEventListener("load", () => run().catch(finish), { once: true });
})(window);
