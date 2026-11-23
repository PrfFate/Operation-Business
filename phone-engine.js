(function (root) {
  "use strict";

  /**
   * Sanitizes a single phone token into digits, preserving leading plus if any.
   */
  function sanitizeToken(token) {
    if (!token) return "";
    let trimmed = token.trim();
    const hasPlus = trimmed.startsWith("+");
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (!digitsOnly) return "";
    return hasPlus ? "+" + digitsOnly : digitsOnly;
  }

  /**
   * Normalizes a phone number to standard 10-digit format (5XXXXXXXXX) if Turkish mobile.
   */
  function to10Digit(token) {
    let clean = token.replace(/\D/g, "");
    // If starts with 90 and has at least 12 digits (or starts with 905...)
    if (clean.length === 12 && clean.startsWith("90")) {
      return clean.substring(2);
    }
    // If starts with 0 and has 11 digits (e.g. 05XXXXXXXXX)
    if (clean.length === 11 && clean.startsWith("0")) {
      return clean.substring(1);
    }
    // If starts with 90 but irregular length (e.g. 905...)
    if (clean.startsWith("905") && clean.length > 10) {
      return clean.substring(2);
    }
    return clean;
  }

  /**
   * Transform an individual phone number according to the selected mode.
   */
  function transformNumber(token, mode) {
    if (!token) return "";
    mode = mode || "strip_90";

    const clean = token.replace(/\D/g, "");
    if (!clean) return "";

    const tenDigit = to10Digit(token);

    switch (mode) {
      case "strip_90": // 5XXXXXXXXX (10 hane)
        return tenDigit;

      case "add_90": // 905XXXXXXXXX (12 hane)
        if (tenDigit.length === 10) {
          return "90" + tenDigit;
        }
        return clean.startsWith("90") ? clean : "90" + clean;

      case "add_plus_90": // +905XXXXXXXXX
        if (tenDigit.length === 10) {
          return "+90" + tenDigit;
        }
        return (token.startsWith("+") ? "" : "+") + (clean.startsWith("90") ? clean : "90" + clean);

      case "add_0": // 05XXXXXXXXX (11 hane)
        if (tenDigit.length === 10) {
          return "0" + tenDigit;
        }
        return clean.startsWith("0") ? clean : "0" + clean;

      case "raw_strip_prefix": // Sadece baştaki 90'ı veya +90'ı kırp (diğer hanelere karışma)
        if (token.startsWith("+90")) return token.substring(3).trim();
        if (clean.startsWith("90")) return clean.substring(2);
        return clean;

      default:
        return tenDigit;
    }
  }

  /**
   * Parses text input into an array of phone number tokens.
   */
  function parse(text, options) {
    if (!text || typeof text !== "string") return [];
    options = options || {};

    // Split on commas, semicolons, newlines, tabs, and multiple spaces
    const rawTokens = text
      .split(/[\r\n,;\t]+/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);

    // If there are space-separated items inside, split them too if sanitize is enabled
    const tokens = [];
    rawTokens.forEach(function (chunk) {
      // If chunk contains space-separated numbers like "90501111 90502222"
      const subItems = chunk.split(/\s{2,}|\s+(?=[+0-9]{10,})/);
      subItems.forEach(function (sub) {
        const cleaned = sub.trim();
        if (cleaned) tokens.push(cleaned);
      });
    });

    return tokens;
  }

  /**
   * Main processor function.
   */
  function process(text, options) {
    options = options || {};
    const mode = options.mode || "strip_90";
    const separator = options.separator || "comma";
    const distinct = Boolean(options.distinct);

    const rawTokens = parse(text, options);
    const totalCount = rawTokens.length;

    let processedList = [];
    rawTokens.forEach(function (token) {
      const transformed = transformNumber(token, mode);
      if (transformed) {
        processedList.push(transformed);
      }
    });

    const uniqueSet = new Set(processedList);
    const uniqueCount = uniqueSet.size;
    const duplicateCount = processedList.length - uniqueCount;

    if (distinct) {
      processedList = Array.from(uniqueSet);
    }

    let outputText = "";
    switch (separator) {
      case "comma": // 501...,505... (User's primary request)
        outputText = processedList.join(",");
        break;
      case "comma_space": // 501..., 505...
        outputText = processedList.join(", ");
        break;
      case "newline": // alt alta
        outputText = processedList.join("\n");
        break;
      case "sql_single": // '501...', '505...'
        outputText = processedList.map(function (n) { return "'" + n + "'"; }).join(", ");
        break;
      case "sql_in": // IN ('501...', '505...')
        outputText = "IN (" + processedList.map(function (n) { return "'" + n + "'"; }).join(", ") + ")";
        break;
      default:
        outputText = processedList.join(",");
        break;
    }

    return {
      totalCount: totalCount,
      outputCount: processedList.length,
      uniqueCount: uniqueCount,
      duplicateCount: duplicateCount,
      outputText: outputText,
      items: processedList
    };
  }

  const PhoneEngine = {
    parse: parse,
    transformNumber: transformNumber,
    to10Digit: to10Digit,
    process: process
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PhoneEngine;
  } else {
    root.PhoneEngine = PhoneEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
