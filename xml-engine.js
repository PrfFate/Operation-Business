(function (root) {
  "use strict";

  const INDENT = "  ";

  function asText(value) {
    return value == null ? "" : String(value);
  }

  function decodeName(name) {
    return name || "(adsiz)";
  }

  function parse(text) {
    const source = asText(text).trim();
    if (!source) return { ok: false, empty: true, error: "XML bekleniyor." };
    const document = new DOMParser().parseFromString(source, "application/xml");
    const parserError = document.querySelector("parsererror");
    if (parserError) {
      return { ok: false, error: parserError.textContent.replace(/\s+/g, " ").trim() || "XML okunamadi." };
    }
    return { ok: true, document: document };
  }

  function escapeXml(value) {
    return asText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function significantChildren(node) {
    return Array.from(node.childNodes).filter(function (child) {
      return child.nodeType !== Node.TEXT_NODE || child.nodeValue.trim() !== "";
    });
  }

  function elementIndex(element) {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.nodeName === element.nodeName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function nodePath(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      parts.unshift(decodeName(current.nodeName) + "[" + elementIndex(current) + "]");
      current = current.parentElement;
    }
    return "/" + parts.join("/");
  }

  function sortedAttributes(element) {
    return Array.from(element.attributes || []).sort(function (a, b) {
      return a.name.localeCompare(b.name, "tr");
    });
  }

  function serializeNode(node, level) {
    if (node.nodeType === Node.TEXT_NODE) {
      return INDENT.repeat(level) + node.nodeValue.trim();
    }
    if (node.nodeType === Node.CDATA_SECTION_NODE) {
      return INDENT.repeat(level) + "<![CDATA[" + node.nodeValue + "]]>";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const attrs = sortedAttributes(node).map(function (attr) {
      return " " + attr.name + "=\"" + escapeXml(attr.value) + "\"";
    }).join("");
    const children = significantChildren(node);
    const pad = INDENT.repeat(level);
    if (!children.length) return pad + "<" + node.nodeName + attrs + "/>";
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
      return pad + "<" + node.nodeName + attrs + ">" + escapeXml(children[0].nodeValue.trim()) + "</" + node.nodeName + ">";
    }
    return [
      pad + "<" + node.nodeName + attrs + ">",
      children.map(function (child) { return serializeNode(child, level + 1); }).filter(Boolean).join("\n"),
      pad + "</" + node.nodeName + ">"
    ].filter(Boolean).join("\n");
  }

  function canonical(document) {
    return document && document.documentElement ? serializeNode(document.documentElement, 0) : "";
  }

  function flatten(document) {
    const entries = new Map();
    function add(path, type, name, value) {
      entries.set(path + "|" + type + "|" + name, {
        key: path + "|" + type + "|" + name,
        path: path,
        type: type,
        name: name,
        value: value
      });
    }
    function visit(element) {
      const path = nodePath(element);
      add(path, "element", decodeName(element.nodeName), "");
      sortedAttributes(element).forEach(function (attr) {
        add(path + "/@" + attr.name, "attribute", attr.name, attr.value);
      });
      const text = Array.from(element.childNodes)
        .filter(function (child) { return child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE; })
        .map(function (child) { return child.nodeValue.trim(); })
        .filter(Boolean)
        .join(" ");
      if (text) add(path + "/text()", "text", "text()", text);
      Array.from(element.children).forEach(visit);
    }
    if (document && document.documentElement) visit(document.documentElement);
    return entries;
  }

  function compare(leftText, rightText) {
    const leftParsed = parse(leftText);
    const rightParsed = parse(rightText);
    const leftCanonical = leftParsed.ok ? canonical(leftParsed.document) : asText(leftText);
    const rightCanonical = rightParsed.ok ? canonical(rightParsed.document) : asText(rightText);
    const textComparison = root.SmsEngine.compare(leftCanonical, rightCanonical);
    const differences = [];

    if (leftParsed.ok && rightParsed.ok) {
      const leftMap = flatten(leftParsed.document);
      const rightMap = flatten(rightParsed.document);
      const keys = Array.from(new Set(Array.from(leftMap.keys()).concat(Array.from(rightMap.keys())))).sort();
      keys.forEach(function (key) {
        const left = leftMap.get(key);
        const right = rightMap.get(key);
        if (!left) differences.push({ status: "added", path: right.path, type: right.type, name: right.name, left: "", right: right.value });
        else if (!right) differences.push({ status: "removed", path: left.path, type: left.type, name: left.name, left: left.value, right: "" });
        else if (left.value !== right.value) differences.push({ status: "changed", path: left.path, type: left.type, name: left.name, left: left.value, right: right.value });
      });
    }

    return {
      left: leftParsed,
      right: rightParsed,
      leftCanonical: leftCanonical,
      rightCanonical: rightCanonical,
      textComparison: textComparison,
      differences: differences
    };
  }

  root.XmlEngine = Object.freeze({ parse: parse, compare: compare, canonical: canonical });
})(typeof globalThis !== "undefined" ? globalThis : window);
