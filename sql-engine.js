(function (root) {
  "use strict";

  function parse(text, options) {
    if (!text) return [];
    options = options || {};
    const mode = options.mode || "auto";
    let tokens = [];

    if (mode === "lines") {
      tokens = text
        .split(/\r\n|\r|\n/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);
    } else {
      // Auto: split by newlines, commas, semicolons, tabs, and spaces
      tokens = text
        .split(/[\r\n,;\t ]+/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    }

    // Strip wrapping quotes if user pasted already-quoted values
    if (options.stripQuotes !== false) {
      tokens = tokens.map(function (t) {
        return t.replace(/^['"`]+|['"`]+$/g, "").trim();
      }).filter(Boolean);
    }

    if (options.distinct) {
      tokens = Array.from(new Set(tokens));
    }

    return tokens;
  }

  function format(tokens, options) {
    if (!tokens || tokens.length === 0) return "";
    options = options || {};
    const quote = options.quote || "none";
    const separator = options.separator || ",";
    const wrap = options.wrap || "none";

    const mapped = tokens.map(function (token) {
      if (quote === "single") return "'" + token + "'";
      if (quote === "double") return '"' + token + '"';
      return token;
    });

    const body = mapped.join(separator);

    if (wrap === "parens") return "(" + body + ")";
    if (wrap === "in") return "IN (" + body + ")";
    if (wrap === "not_in") return "NOT IN (" + body + ")";
    return body;
  }

  const SqlEngine = {
    parse: parse,
    format: format
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SqlEngine;
  } else {
    root.SqlEngine = SqlEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
