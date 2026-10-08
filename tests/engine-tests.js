(function (root) {
  "use strict";

  function runEngineTests() {
    const engine = root.SmsEngine;
    const results = [];
    function assert(condition, message) { if (!condition) throw new Error(message || "Assertion failed"); }
    function same(actual, expected) { assert(JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + " != " + JSON.stringify(expected)); }
    function test(name, run) {
      try { run(); results.push({ test: name, passed: true, error: "" }); }
      catch (error) { results.push({ test: name, passed: false, error: error.message }); }
    }
    function reconstructed(result, left, right) {
      same(result.leftRuns.map(function (run) { return run.text; }).join(""), left);
      same(result.rightRuns.map(function (run) { return run.text; }).join(""), right);
      same(result.leftRuns.filter(function (run) { return run.type === "equal"; }).map(function (run) { return run.text; }).join(""),
        result.rightRuns.filter(function (run) { return run.type === "equal"; }).map(function (run) { return run.text; }).join(""));
    }
    function lcsLength(left, right) {
      const a = Array.from(left);
      const b = Array.from(right);
      const row = new Uint16Array(b.length + 1);
      for (let i = 0; i < a.length; i += 1) {
        let diagonal = 0;
        for (let j = 1; j <= b.length; j += 1) {
          const previous = row[j];
          row[j] = a[i] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
          diagonal = previous;
        }
      }
      return row[b.length];
    }

    test("Empty input is ASCII and costs zero segments", function () {
      const result = engine.analyze("");
      same([result.characters, result.utf8Bytes, result.segments, result.isAscii], [0, 0, 0, true]);
      same(engine.compare("", "").similarity, 100);
    });
    test("ASCII controls pass strict ASCII but generate warnings", function () {
      const result = engine.analyze("A\tB\n\x7f");
      assert(result.isAscii);
      same(result.warnings.length, 3);
      same(result.encoding, "Unicode");
    });
    test("Turkish letters are outside ASCII", function () {
      const result = engine.analyze("İğüşöç");
      same(result.nonAscii.length, 6);
      same(result.nonAscii[0].unicode, "U+0130");
      same(result.encoding, "Unicode");
    });
    test("GSM and ASCII differ", function () {
      const result = engine.analyze("é£Ö€");
      same([result.isAscii, result.encoding, result.units, result.extensionCount], [false, "GSM-7", 5, 1]);
      same(engine.analyze("`").encoding, "Unicode");
      same(engine.analyze("\x1b").encoding, "Unicode");
    });
    test("All GSM extension characters use two septets", function () {
      const result = engine.analyze("\f^{}\\[~]|€");
      same([result.encoding, result.units, result.extensionCount], ["GSM-7", 20, 10]);
    });
    test("GSM segment limits and indivisible escape pairs", function () {
      same(engine.analyze("a".repeat(160)).segments, 1);
      same(engine.analyze("a".repeat(161)).segments, 2);
      same(engine.analyze("a".repeat(306)).segments, 2);
      same(engine.analyze("^".repeat(153)).segments, 3);
    });
    test("Unicode segment limits and surrogate pairs", function () {
      same(engine.analyze("ğ".repeat(70)).segments, 1);
      same(engine.analyze("ğ".repeat(71)).segments, 2);
      same(engine.analyze("😀".repeat(67)).segments, 3);
      same(engine.analyze("😀".repeat(35)).segments, 1);
    });
    test("Code points, UTF16 units and UTF8 bytes are distinct", function () {
      const result = engine.analyze("ağ😀");
      same([result.characters, result.utf16Length, result.utf8Bytes, result.units], [3, 4, 7, 4]);
      same(result.nonAscii[1].position, 3);
      same(result.nonAscii[1].unicode, "U+1F600");
    });
    test("Unpaired surrogate is flagged and encodes like TextEncoder", function () {
      const result = engine.analyze("\ud800");
      same(result.utf8Bytes, new TextEncoder().encode("\ud800").length);
      same(result.warnings[0].type, "invalid-unicode");
    });
    test("CRLF, CR, LF and invisible characters retain exact positions", function () {
      const result = engine.analyze("A\r\nğ\rB\n\u200b\u00a0");
      same([result.lineCount, result.whitespace.lineBreaks], [4, 3]);
      same(result.nonAscii[0], { character: "ğ", display: "ğ", position: 4, line: 2, column: 1, unicode: "U+011F" });
      same(result.warnings.filter(function (item) { return item.type === "invisible"; }).length, 2);
    });
    test("Special Unicode whitespace is flagged while ordinary spaces remain valid", function () {
      const result = engine.analyze("A \u1680\u00a0\u2007\u202f\u3000B");
      same(result.warnings.map(function (item) { return item.unicode; }), ["U+1680", "U+00A0", "U+2007", "U+202F", "U+3000"]);
      assert(result.warnings.every(function (item) { return item.type === "invisible"; }));
      same([result.warnings[0].display, result.warnings[0].position, result.warnings[0].line, result.warnings[0].column], ["U+1680", 3, 1, 3]);
      same(engine.analyze("ordinary spaces remain valid").warnings.length, 0);
    });
    test("Exact whitespace and Unicode normalization differences remain visible", function () {
      assert(!engine.compare("SMS ", "SMS").equal);
      assert(!engine.compare("a\r\nb", "a\nb").equal);
      assert(!engine.compare("é", "e\u0301").equal);
      assert(!engine.compare("sms", "s\u200bms", { ignoreWhitespace: true }).equal);
    });
    test("Turkish case and Unicode whitespace options", function () {
      const result = engine.compare(" İSTANBUL\n IŞIK\u00a0", "istanbulışık", { ignoreCase: true, ignoreWhitespace: true });
      assert(result.equal && !result.exactEqual);
      assert(!engine.compare("I", "i", { ignoreCase: true }).equal);
      assert(engine.compare("x\u0085y", "xy", { ignoreWhitespace: true }).equal);
      reconstructed(result, "istanbulışık", "istanbulışık");
    });
    test("Replacements count once and astral code points are not split", function () {
      const result = engine.compare("A😀BC", "A🚀BC");
      same(result.differenceCount, 1);
      same(result.firstDifference, { position: 2, leftCharacter: "😀", rightCharacter: "🚀" });
      same([result.removedCount, result.addedCount, result.similarity], [1, 1, 75]);
      reconstructed(result, "A😀BC", "A🚀BC");
    });
    test("Insertions, deletions and raw HTML reconstruct safely as plain text", function () {
      [["abc", "abXc"], ["xab", "ab"], ["", "<img src=x onerror=alert(1)>"], ["test", ""], ["same", "same"]].forEach(function (pair) {
        reconstructed(engine.compare(pair[0], pair[1]), pair[0], pair[1]);
      });
    });
    test("Deterministic fuzz verifies minimal diff against independent LCS", function () {
      let seed = 1847;
      function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
      const alphabet = ["a", "b", "c", " ", "ğ", "😀", "\n"];
      for (let round = 0; round < 300; round += 1) {
        let left = "";
        let right = "";
        const lengthA = Math.floor(random() * 25);
        const lengthB = Math.floor(random() * 25);
        for (let i = 0; i < lengthA; i += 1) left += alphabet[Math.floor(random() * alphabet.length)];
        for (let i = 0; i < lengthB; i += 1) right += alphabet[Math.floor(random() * alphabet.length)];
        const result = engine.compare(left, right);
        reconstructed(result, left, right);
        same(result.commonCharacters, lcsLength(left, right));
        same(result.equal, left === right);
        assert(!result.diffApproximate);
      }
    });
    test("Long similar input retains precise highlights", function () {
      const left = "a".repeat(4999) + "x" + "b".repeat(5000);
      const right = "a".repeat(4999) + "y" + "b".repeat(5000);
      const result = engine.compare(left, right);
      reconstructed(result, left, right);
      same(result.differenceCount, 1);
      assert(!result.diffApproximate);
    });
    test("Long unrelated input has bounded work and explicit coarse flag", function () {
      const left = "a".repeat(10000);
      const right = "b".repeat(10000);
      const result = engine.compare(left, right);
      reconstructed(result, left, right);
      assert(!result.equal && result.diffApproximate);
      same([result.differenceCount, result.similarity], [10000, 0]);
    });
    if (root.console && console.table) console.table(results);
    return { passed: results.filter(function (item) { return item.passed; }).length, failed: results.filter(function (item) { return !item.passed; }).length, results: results };
  }
  root.runEngineTests = runEngineTests;
})(typeof globalThis !== "undefined" ? globalThis : window);
