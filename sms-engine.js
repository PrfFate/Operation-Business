(function (root) {
  "use strict";

  // Default GSM alphabet only; national-language shift tables are not assumed.
  // ETSI TS 123 038, sections 6.2.1 and 6.2.1.1:
  // https://www.etsi.org/deliver/etsi_ts/123000_123099/123038/16.00.00_60/ts_123038v160000p.pdf
  // Segment capacities: https://www.twilio.com/docs/glossary/what-sms-character-limit
  const GSM_BASIC = new Set(Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
  ));
  const GSM_EXTENSION = new Set(Array.from("\f^{}\\[~]|€"));
  const WHITE_SPACE = /\p{White_Space}/u;
  const ALL_WHITE_SPACE = /\p{White_Space}+/gu;
  const INVISIBLE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;
  const DISPLAY = {
    "\0": "NUL", "\t": "TAB", "\n": "LF", "\r": "CR", "\f": "FF", "\v": "VT",
    " ": "BOŞLUK", "\u007f": "DEL", "\u0085": "NEL", "\u00a0": "NBSP",
    "\u00ad": "SOFT HYPHEN", "\u200b": "ZERO WIDTH SPACE", "\u200c": "ZWNJ",
    "\u200d": "ZWJ", "\u200e": "LRM", "\u200f": "RLM", "\u2028": "LINE SEPARATOR",
    "\u2029": "PARAGRAPH SEPARATOR", "\u202f": "NARROW NBSP", "\u2060": "WORD JOINER",
    "\ufeff": "BOM / ZERO WIDTH NBSP"
  };

  function asText(value) {
    return value == null ? "" : String(value);
  }

  function unicodeOf(character) {
    return "U+" + character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  }

  function displayCharacter(character) {
    if (character == null) return "METİN SONU";
    if (Object.prototype.hasOwnProperty.call(DISPLAY, character)) return DISPLAY[character];
    const code = character.codePointAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return "KONTROL " + unicodeOf(character);
    if (INVISIBLE.test(character) || WHITE_SPACE.test(character)) return unicodeOf(character);
    if (code >= 0xd800 && code <= 0xdfff) return "GEÇERSİZ UNICODE " + unicodeOf(character);
    return character;
  }

  function utf8Length(characters) {
    // Unpaired UTF-16 surrogates encode as U+FFFD (three bytes), like TextEncoder.
    return characters.reduce(function (total, character) {
      const code = character.codePointAt(0);
      return total + (code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4);
    }, 0);
  }

  function analyze(value) {
    const text = asText(value);
    const characters = Array.from(text);
    const nonAscii = [];
    const warnings = [];
    const nonGsm = [];
    let line = 1;
    let column = 1;
    let septets = 0;
    let extensionCount = 0;
    let spaces = 0;
    let tabs = 0;
    let lineBreaks = 0;
    let carriageReturns = 0;
    let lineFeeds = 0;

    characters.forEach(function (character, index) {
      const code = character.codePointAt(0);
      const entry = {
        character: character,
        display: displayCharacter(character),
        position: index + 1,
        line: line,
        column: column,
        unicode: unicodeOf(character)
      };
      if (code > 127) nonAscii.push(entry);
      if (GSM_BASIC.has(character)) {
        septets += 1;
      } else if (GSM_EXTENSION.has(character)) {
        septets += 2;
        extensionCount += 1;
      } else {
        nonGsm.push(entry);
      }

      let warningType = null;
      let message = "";
      if (code >= 0xd800 && code <= 0xdfff) {
        warningType = "invalid-unicode";
        message = "Eşleşmeyen UTF-16 surrogate; geçersiz Unicode karakteri.";
      } else if (code < 32 || (code >= 127 && code <= 159)) {
        warningType = "control";
        message = "Kontrol karakteri: " + entry.display;
      } else if ((WHITE_SPACE.test(character) && character !== " ") || INVISIBLE.test(character)) {
        warningType = "invisible";
        message = "Görünmez veya özel boşluk karakteri: " + entry.display;
      }
      if (warningType) warnings.push(Object.assign({ type: warningType, message: message }, entry));

      if (character === " ") spaces += 1;
      if (character === "\t") tabs += 1;
      if (character === "\r") carriageReturns += 1;
      if (character === "\n") lineFeeds += 1;
      // CRLF is one line break; its two characters retain their individual positions.
      if (character === "\n" || character === "\u0085" || character === "\u2028" || character === "\u2029" ||
          (character === "\r" && characters[index + 1] !== "\n")) {
        line += 1;
        column = 1;
        lineBreaks += 1;
      } else {
        column += 1;
      }
    });

    const isGsm = nonGsm.length === 0;
    const units = isGsm ? septets : text.length;
    const singleSegmentLimit = isGsm ? 160 : 70;
    const multipartSegmentLimit = isGsm ? 153 : 67;
    const segmentLimit = units <= singleSegmentLimit ? singleSegmentLimit : multipartSegmentLimit;
    // Keep GSM escape sequences and UTF-16 surrogate pairs in the same segment.
    let segments = units === 0 ? 0 : 1;
    let lastSegmentUnits = 0;
    for (const character of characters) {
      const width = isGsm ? (GSM_EXTENSION.has(character) ? 2 : 1) : character.length;
      if (lastSegmentUnits + width > segmentLimit) {
        segments += 1;
        lastSegmentUnits = 0;
      }
      lastSegmentUnits += width;
    }
    let leading = 0;
    let trailing = 0;
    while (leading < characters.length && WHITE_SPACE.test(characters[leading])) leading += 1;
    while (trailing < characters.length && WHITE_SPACE.test(characters[characters.length - trailing - 1])) trailing += 1;

    return {
      text: text,
      characters: characters.length,
      utf16Length: text.length,
      utf8Bytes: utf8Length(characters),
      isAscii: nonAscii.length === 0,
      asciiCount: characters.length - nonAscii.length,
      nonAscii: nonAscii,
      nonAsciiCount: nonAscii.length,
      warnings: warnings,
      nonGsm: nonGsm,
      encoding: isGsm ? "GSM-7" : "Unicode",
      units: units,
      segments: segments,
      segmentLimit: segmentLimit,
      singleSegmentLimit: singleSegmentLimit,
      multipartSegmentLimit: multipartSegmentLimit,
      lastSegmentUnits: lastSegmentUnits,
      remaining: segmentLimit - lastSegmentUnits,
      extensionCount: extensionCount,
      lineCount: text.length === 0 ? 0 : lineBreaks + 1,
      whitespace: { spaces: spaces, tabs: tabs, lineBreaks: lineBreaks, carriageReturns: carriageReturns, lineFeeds: lineFeeds, leading: leading, trailing: trailing }
    };
  }

  // No NFC/NFKC normalization: visually similar Unicode can remain different.
  // Case folding uses Turkish locale, so I = ı and İ = i, while I != i.
  // ignoreWhitespace removes Unicode White_Space (spaces, tabs, line breaks, etc.).
  function normalize(value, options) {
    let text = asText(value);
    options = options || {};
    if (options.ignoreCase) text = text.toLocaleLowerCase("tr-TR");
    if (options.ignoreWhitespace) text = text.replace(ALL_WHITE_SPACE, "");
    return text;
  }

  function appendRun(runs, type, text) {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.text += text;
    else runs.push({ type: type, text: text });
  }

  function backtrack(trace, left, right, offset) {
    let x = left.length;
    let y = right.length;
    const edits = [];
    for (let depth = trace.length - 1; depth >= 0; depth -= 1) {
      const vector = trace[depth];
      const diagonal = x - y;
      const previousDiagonal = diagonal === -depth || (diagonal !== depth && vector[offset + diagonal - 1] < vector[offset + diagonal + 1])
        ? diagonal + 1 : diagonal - 1;
      const previousX = vector[offset + previousDiagonal];
      const previousY = previousX - previousDiagonal;
      while (x > previousX && y > previousY) {
        edits.push({ type: "equal", text: left[x - 1] });
        x -= 1;
        y -= 1;
      }
      if (depth === 0) break;
      if (x === previousX) {
        edits.push({ type: "added", text: right[y - 1] });
        y -= 1;
      } else {
        edits.push({ type: "removed", text: left[x - 1] });
        x -= 1;
      }
    }
    const runs = [];
    edits.reverse().forEach(function (edit) { appendRun(runs, edit.type, edit.text); });
    return runs;
  }

  function middleDiff(left, right) {
    if (left.length === 0) return { runs: right.length ? [{ type: "added", text: right.join("") }] : [], approximate: false };
    if (right.length === 0) return { runs: [{ type: "removed", text: left.join("") }], approximate: false };

    // Bounded Myers search: at most ~2 MB of trace, even for huge pasted text.
    // Equality is always exact; coarse highlighting is explicitly reported if capped.
    const maximumDepth = Math.min(left.length + right.length, 512);
    const offset = maximumDepth + 1;
    const vector = new Int32Array(maximumDepth * 2 + 3);
    const trace = [];
    let work = 0;
    for (let depth = 0; depth <= maximumDepth; depth += 1) {
      trace.push(vector.slice());
      for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
        let x = diagonal === -depth || (diagonal !== depth && vector[offset + diagonal - 1] < vector[offset + diagonal + 1])
          ? vector[offset + diagonal + 1] : vector[offset + diagonal - 1] + 1;
        let y = x - diagonal;
        while (x < left.length && y < right.length && left[x] === right[y]) {
          x += 1;
          y += 1;
          work += 1;
        }
        vector[offset + diagonal] = x;
        if (x >= left.length && y >= right.length) return { runs: backtrack(trace, left, right, offset), approximate: false };
      }
      if (work > 2000000) break;
    }
    return { runs: [{ type: "removed", text: left.join("") }, { type: "added", text: right.join("") }], approximate: true };
  }

  function compare(leftValue, rightValue, options) {
    const originalLeft = asText(leftValue);
    const originalRight = asText(rightValue);
    const normalizedLeft = normalize(originalLeft, options);
    const normalizedRight = normalize(originalRight, options);
    const left = Array.from(normalizedLeft);
    const right = Array.from(normalizedRight);
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix += 1;
    const middle = middleDiff(left.slice(prefix, left.length - suffix), right.slice(prefix, right.length - suffix));
    const runs = [];
    appendRun(runs, "equal", left.slice(0, prefix).join(""));
    middle.runs.forEach(function (run) { appendRun(runs, run.type, run.text); });
    if (suffix) appendRun(runs, "equal", left.slice(left.length - suffix).join(""));
    const leftRuns = [];
    const rightRuns = [];
    let commonCharacters = 0;
    let removed = 0;
    let added = 0;
    let differenceCount = 0;
    let removedCount = 0;
    let addedCount = 0;
    runs.forEach(function (run) {
      const length = Array.from(run.text).length;
      if (run.type === "equal") {
        differenceCount += Math.max(removed, added);
        removed = 0;
        added = 0;
        commonCharacters += length;
        appendRun(leftRuns, "equal", run.text);
        appendRun(rightRuns, "equal", run.text);
      } else if (run.type === "removed") {
        removed += length;
        removedCount += length;
        appendRun(leftRuns, "removed", run.text);
      } else {
        added += length;
        addedCount += length;
        appendRun(rightRuns, "added", run.text);
      }
    });
    differenceCount += Math.max(removed, added);
    const totalCharacters = left.length + right.length;
    const equal = normalizedLeft === normalizedRight;
    return {
      equal: equal,
      exactEqual: originalLeft === originalRight,
      similarity: totalCharacters === 0 ? 100 : Math.round(2000 * commonCharacters / totalCharacters) / 10,
      differenceCount: differenceCount,
      removedCount: removedCount,
      addedCount: addedCount,
      commonCharacters: commonCharacters,
      diffApproximate: middle.approximate,
      leftRuns: leftRuns,
      rightRuns: rightRuns,
      runs: runs,
      firstDifference: equal ? null : { position: prefix + 1, leftCharacter: left[prefix] || null, rightCharacter: right[prefix] || null },
      normalizedLeft: normalizedLeft,
      normalizedRight: normalizedRight
    };
  }

  root.SmsEngine = Object.freeze({ analyze: analyze, compare: compare, normalize: normalize, displayCharacter: displayCharacter });
})(typeof globalThis !== "undefined" ? globalThis : window);
