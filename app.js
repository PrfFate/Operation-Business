(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const engine = window.SmsEngine;
  const xmlEngine = window.XmlEngine;
  const sides = ["left", "right"];
  const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
  let activeTab = "nonascii";
  let current;
  let currentXml;
  let analysisTimer;
  let xmlTimer;
  let toastTimer;

  const mobileMenu = window.matchMedia("(max-width: 760px)");
  const sidebarToggle = $("sidebar-toggle");
  const sidebarPreferenceKey = "operasyon-merkezi.sidebar-collapsed";
  let desktopSidebarCollapsed = false;
  try {
    desktopSidebarCollapsed = localStorage.getItem(sidebarPreferenceKey) === "true";
  } catch (_) {
    // Storage can be unavailable when the page is opened from a local file.
  }

  function setSidebarCollapsed(collapsed) {
    const mobileOpen = mobileMenu.matches && !collapsed;
    if (mobileMenu.matches && collapsed && $("sidebar").contains(document.activeElement)) {
      sidebarToggle.focus();
    }
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? "Menüyü aç" : mobileMenu.matches ? "Menüyü kapat" : "Menüyü daralt";
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
    $("sidebar").inert = mobileMenu.matches && collapsed;
    document.querySelector(".app-shell").inert = mobileOpen;
    $("sidebar-backdrop").hidden = !mobileOpen;
  }

  sidebarToggle.addEventListener("click", () => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    setSidebarCollapsed(collapsed);
    if (!mobileMenu.matches) {
      desktopSidebarCollapsed = collapsed;
      try {
        localStorage.setItem(sidebarPreferenceKey, String(collapsed));
      } catch (_) {
        // The menu remains usable without persisted preferences.
      }
    }
  });
  $("sidebar-backdrop").addEventListener("click", () => {
    setSidebarCollapsed(true);
    sidebarToggle.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenu.matches && !$("info-dialog").open && !document.body.classList.contains("sidebar-collapsed")) {
      setSidebarCollapsed(true);
      sidebarToggle.focus();
    }
  });
  mobileMenu.addEventListener("change", () => setSidebarCollapsed(mobileMenu.matches || desktopSidebarCollapsed));
  setSidebarCollapsed(mobileMenu.matches || desktopSidebarCollapsed);

  function setText(id, value) { $(id).textContent = String(value); }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  }
  function options() {
    return { ignoreWhitespace: $("ignore-whitespace").checked, ignoreCase: $("ignore-case").checked };
  }
  function similarityLabel(comparison) {
    return !comparison.equal && comparison.similarity === 100 ? "< %100" : "%" + number.format(comparison.similarity);
  }
  function notify(message) {
    clearTimeout(toastTimer);
    setText("toast-text", message);
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4000);
  }

  function renderSide(side, analysis) {
    const hasText = analysis.text.length > 0;
    setText(side + "-characters", number.format(analysis.characters));
    setText(side + "-length", number.format(analysis.utf16Length));
    setText(side + "-encoding", hasText ? analysis.encoding : "—");
    setText(side + "-segments", hasText ? number.format(analysis.segments) : "—");
    setText(side + "-bytes", number.format(analysis.utf8Bytes));
    const badge = $(side + "-ascii");
    badge.className = "encoding-badge" + (hasText ? (analysis.isAscii ? " good" : " warning") : "");
    badge.textContent = !hasText ? "ASCII kontrolü bekleniyor" : analysis.isAscii ? "ASCII uyumlu" : number.format(analysis.nonAscii.length) + " ASCII dışı karakter";
    $(side + "-characters").title = "Unicode kod noktası sayısı. Emoji birleşimleri birden fazla karakter içerebilir.";
    $(side + "-length").parentElement.title = "Giriş sınırı UTF-16 birimi cinsindendir. Bazı emojiler 2 birim kullanır.";
    $(side + "-encoding").title = hasText ? analysis.encoding === "GSM-7" ? "Standart GSM-7 alfabesi · " + analysis.units + " septet" : "Unicode · " + analysis.units + " UTF-16 birimi" : "SMS kodlaması metin girildiğinde hesaplanır.";
    $(side + "-segments").title = hasText ? "Tahmini parça sayısı. " + analysis.segmentLimit + " birim/parça; son parçada " + analysis.remaining + " birim boş. Operatörün kodlama ve dil tablolarına göre değişebilir." : "Standart GSM-7 / Unicode parça tahmini";
    document.querySelectorAll('[data-side="' + side + '"][data-action="copy"], [data-side="' + side + '"][data-action="clear"]').forEach((button) => { button.disabled = !hasText; });
  }

  const INVISIBLE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u00a0\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]/u;

  function renderRunContent(fragment, text, type, showNonAscii) {
    if (!showNonAscii) {
      if (type === "equal" || !type) {
        fragment.append(document.createTextNode(text));
      } else {
        const mark = document.createElement("mark");
        mark.className = type;
        mark.textContent = text;
        fragment.append(mark);
      }
      return;
    }

    const chars = Array.from(text);
    let buffer = "";
    let currentCategory = null;

    function flush() {
      if (!buffer) return;
      if (currentCategory === "invisible") {
        const mark = document.createElement("mark");
        mark.className = type && type !== "equal" ? type + " invisible-char" : "invisible-char";
        mark.textContent = buffer;
        fragment.append(mark);
      } else if (currentCategory === "nonascii") {
        const mark = document.createElement("mark");
        mark.className = type && type !== "equal" ? type + " non-ascii" : "non-ascii";
        mark.textContent = buffer;
        fragment.append(mark);
      } else {
        if (type && type !== "equal") {
          const mark = document.createElement("mark");
          mark.className = type;
          mark.textContent = buffer;
          fragment.append(mark);
        } else {
          fragment.append(document.createTextNode(buffer));
        }
      }
      buffer = "";
    }

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const code = ch.codePointAt(0);
      let cat = "normal";
      if (INVISIBLE_PATTERN.test(ch)) {
        cat = "invisible";
      } else if (code > 127) {
        cat = "nonascii";
      }

      if (cat !== currentCategory) {
        flush();
        currentCategory = cat;
      }
      buffer += ch;
    }
    flush();
  }

  function renderHighlights(side, runs) {
    const layer = $(side + "-highlight");
    layer.replaceChildren();
    const showDiffs = $("highlight-differences").checked;
    const showNonAscii = $("highlight-nonascii") ? $("highlight-nonascii").checked : true;

    if (!showDiffs && !showNonAscii) return;
    if (!runs || runs.length === 0) return;

    const fragment = document.createDocumentFragment();
    runs.forEach((run) => {
      const type = !showDiffs && run.type !== "equal" ? "equal" : run.type;
      renderRunContent(fragment, run.text, type, showNonAscii);
    });

    if (!showDiffs) {
      const anyMark = fragment.querySelector("mark");
      if (!anyMark) {
        layer.replaceChildren();
        return;
      }
    }

    // The extra newline keeps textarea and highlight scrolling aligned at the end.
    fragment.append(document.createTextNode("\n"));
    layer.append(fragment);
    layer.scrollTop = $(side + "-text").scrollTop;
    layer.scrollLeft = $(side + "-text").scrollLeft;
  }

  function renderSummary(left, right, comparison) {
    const hasLeft = left.text.length > 0;
    const hasRight = right.text.length > 0;
    const hasAny = hasLeft || hasRight;
    const hasBoth = hasLeft && hasRight;
    const enabledOptions = options();
    const normalized = enabledOptions.ignoreWhitespace || enabledOptions.ignoreCase;
    let title = "Karşılaştırmaya hazır";
    let detail = "Başlamak için iki metin girin";
    let status = "";
    if (hasAny && !hasBoth) {
      title = hasLeft ? "Sağ metin bekleniyor" : "Sol metin bekleniyor";
      detail = "Karşılaştırma için diğer metni ekleyin";
    } else if (hasBoth) {
      title = comparison.equal ? (comparison.exactEqual ? "Metinler birebir aynı" : "Ayarlara göre eşit") : "Metinler farklı";
      detail = comparison.equal ? (comparison.exactEqual ? "Tüm karakterler ve boşluklar eşleşiyor" : "Ham metinlerde farklılık bulunuyor") : (comparison.diffApproximate ? "Yaklaşık " : "") + number.format(comparison.differenceCount) + " karakter farkı bulundu";
      status = comparison.equal ? "good" : "warning";
    }
    setText("equality-title", title);
    setText("equality-detail", detail);
    $("equality-indicator").className = "summary-indicator " + status;
    $("equality-icon").className = "summary-icon " + (status === "good" ? "mint" : status === "warning" ? "amber" : "lavender");
    $("equality-icon").replaceChildren(icon(status === "good" ? "check" : "compare"));

    const nonAsciiCount = left.nonAscii.length + right.nonAscii.length;
    setText("ascii-title", !hasAny ? "Kontrol bekleniyor" : nonAsciiCount ? number.format(nonAsciiCount) + " ASCII dışı karakter" : hasBoth ? "Her iki metin uyumlu" : "Girilen metin uyumlu");
    setText("ascii-detail", !hasAny ? "Her iki metin ayrı ayrı incelenir" : nonAsciiCount ? "Karakter detaylarını aşağıda inceleyin" : "Tüm karakterler U+0000–U+007F aralığında");
    $("ascii-icon").className = "summary-icon " + (nonAsciiCount ? "amber" : "mint");
    setText("similarity-title", hasBoth ? (comparison.diffApproximate ? "≈ " : "") + similarityLabel(comparison) : "—");
    setText("similarity-caption", hasBoth ? normalized ? "Ayarlara göre" : "Karakter bazında" : "Henüz hesaplanmadı");
    $("similarity-progress").style.width = hasBoth ? comparison.similarity + "%" : "0%";
    const notes = [];
    if (normalized) {
      const descriptions = [];
      if (enabledOptions.ignoreWhitespace) descriptions.push("Boşluklar, sekmeler ve satır sonları yok sayılır");
      if (enabledOptions.ignoreCase) descriptions.push("harfler Türkçe kurallarla eşleştirilir (I ↔ ı, İ ↔ i)");
      notes.push(descriptions.join("; ") + ". Renkli vurgular ham metinlerdeki farkları gösterir.");
    }
    if (hasBoth && (comparison.diffApproximate || current.raw.diffApproximate)) notes.push("Uzun ve çok farklı metinlerde farklar blok olarak gösterilir; benzerlik ve fark adedi yaklaşık hesaplanır. Eşitlik kontrolü kesindir.");
    $("comparison-note").hidden = notes.length === 0;
    setText("comparison-note", notes.join(" "));
    $("export-report").disabled = !hasAny;
    $("clear-all").disabled = !hasAny;
    $("swap-texts").disabled = !hasAny;
  }

  function entryDescription(entry) {
    if (entry.message) return entry.message;
    if ("çğıöşüÇĞİÖŞÜ".includes(entry.character)) return "Türkçe karakter · ASCII dışında";
    if (/\p{Extended_Pictographic}/u.test(entry.character)) return "Emoji / sembol · ASCII dışında";
    return "ASCII aralığı dışında";
  }

  function renderTable() {
    if (!current) return;
    const selectedSide = $("side-filter").value;
    const selected = sides.filter((side) => selectedSide === "both" || selectedSide === side);
    const nonAscii = selected.flatMap((side) => current[side].nonAscii.map((entry) => ({ ...entry, side })));
    const invisible = selected.flatMap((side) => current[side].warnings.map((entry) => ({ ...entry, side })));
    const entries = activeTab === "nonascii" ? nonAscii : invisible;
    const uniqueIssues = new Set([...nonAscii, ...invisible].map((entry) => entry.side + ":" + entry.position));
    setText("issue-count", number.format(uniqueIssues.size));
    setText("nonascii-count", number.format(nonAscii.length));
    setText("invisible-count", number.format(invisible.length));
    $("analysis-empty").hidden = entries.length > 0;
    $("character-table-wrapper").hidden = entries.length === 0;
    const hasText = selected.some((side) => current[side].text.length > 0);
    if (!entries.length) {
      setText("empty-title", hasText ? activeTab === "nonascii" ? "Tüm karakterler ASCII aralığında." : "Görünmez veya kontrol karakteri bulunamadı." : "Analiz bekleniyor");
      setText("empty-detail", hasText ? activeTab === "nonascii" ? "Seçilen metinlerde ASCII dışında bir karakter yok." : "Seçilen metinler görünmez / kontrol karakteri içermiyor." : "Metinlerinizi eklediğinizde " + (activeTab === "nonascii" ? "ASCII dışı" : "görünmez ve kontrol") + " karakterler burada listelenir.");
    }
    const fragment = document.createDocumentFragment();
    entries.slice(0, 100).forEach((entry) => {
      const row = document.createElement("tr");
      row.className = "clickable";
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.title = (entry.side === "left" ? "Sol" : "Sağ") + " metinde bu karaktere gitmek için tıklayın (Satır " + entry.line + ", sütun " + entry.column + ")";

      const onJump = () => focusCharacter(entry.side, entry);
      row.addEventListener("click", onJump);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onJump();
        }
      });

      const sideCell = document.createElement("td");
      const sideLabel = document.createElement("span");
      sideLabel.className = "table-side";
      const sideBadge = document.createElement("span");
      sideBadge.className = "letter-badge " + entry.side + "-letter";
      sideBadge.textContent = entry.side === "left" ? "A" : "B";
      sideLabel.append(sideBadge, document.createTextNode(entry.side === "left" ? "Sol metin" : "Sağ metin"));
      sideCell.append(sideLabel);
      const characterCell = document.createElement("td");
      const character = document.createElement("bdi");
      character.className = "character-chip";
      character.textContent = entry.display;
      characterCell.append(character);
      const unicodeCell = document.createElement("td");
      const code = document.createElement("code");
      code.className = "unicode-code";
      code.textContent = entry.unicode;
      unicodeCell.append(code);
      const positionCell = document.createElement("td");
      positionCell.append(document.createTextNode(number.format(entry.position) + ". karakter"));
      const positionDetail = document.createElement("span");
      positionDetail.className = "position-detail";
      positionDetail.textContent = "Satır " + entry.line + ", sütun " + entry.column;
      positionCell.append(positionDetail);
      const jumpBadge = document.createElement("span");
      jumpBadge.className = "jump-link-badge";
      jumpBadge.textContent = "Git ↗";
      positionCell.append(jumpBadge);
      const descriptionCell = document.createElement("td");
      descriptionCell.textContent = entryDescription(entry);
      row.append(sideCell, characterCell, unicodeCell, positionCell, descriptionCell);
      fragment.append(row);
    });
    $("character-table-body").replaceChildren(fragment);
    $("table-limit-note").hidden = entries.length <= 100;
    setText("table-limit-note", "Toplam " + number.format(entries.length) + " kaydın ilk 100 tanesi gösteriliyor. Tam liste için raporu indirin.");
  }

  function getSelectionOffsets(text, entry) {
    const chars = Array.from(text);
    const targetIndex = entry.position - 1;
    let offset = 0;
    for (let i = 0; i < targetIndex && i < chars.length; i++) {
      offset += chars[i].length;
    }
    const charLen = targetIndex >= 0 && targetIndex < chars.length ? chars[targetIndex].length : 1;
    return { start: offset, end: offset + charLen };
  }

  function focusCharacter(side, entry) {
    const textarea = $(side + "-text");
    const card = $(side + "-card");
    if (!textarea || !card) return;

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea.focus();

    const range = getSelectionOffsets(textarea.value, entry);
    try {
      textarea.setSelectionRange(range.start, range.end);
    } catch (_) {}

    const lineHeight = 24;
    const targetScroll = Math.max(0, (entry.line - 2) * lineHeight);
    textarea.scrollTop = targetScroll;
    const layer = $(side + "-highlight");
    if (layer) layer.scrollTop = targetScroll;

    card.classList.remove("card-pulse");
    void card.offsetWidth;
    card.classList.add("card-pulse");

    notify((entry.side === "left" ? "Sol metin" : "Sağ metin") + ": " + entry.line + ". satır, " + entry.column + ". sütundaki '" + entry.display + "' seçildi.");
  }

  function analyze() {
    clearTimeout(analysisTimer);
    const left = engine.analyze($("left-text").value);
    const right = engine.analyze($("right-text").value);
    const settings = options();
    const comparison = engine.compare(left.text, right.text, settings);
    const raw = settings.ignoreCase || settings.ignoreWhitespace ? engine.compare(left.text, right.text) : comparison;
    current = { left, right, comparison, raw };
    sides.forEach((side) => renderSide(side, current[side]));
    renderSummary(left, right, comparison);
    const hasBoth = Boolean(left.text && right.text);
    const leftRuns = hasBoth ? raw.leftRuns : (left.text ? [{ type: "equal", text: left.text }] : []);
    const rightRuns = hasBoth ? raw.rightRuns : (right.text ? [{ type: "equal", text: right.text }] : []);
    renderHighlights("left", leftRuns);
    renderHighlights("right", rightRuns);
    renderTable();
  }

  function setInput(side, text) {
    // Enforce the same size limit for clipboard and programmatic text insertion.
    let limited = text.slice(0, 10000);
    if (limited.length < text.length && /[\uD800-\uDBFF]$/.test(limited)) limited = limited.slice(0, -1);
    $(side + "-text").value = limited;
    if (limited.length < text.length) notify("Metin, 10.000 UTF-16 birimlik giriş sınırına kısaltıldı.");
  }

  function selectTab(tab, focus) {
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".analysis-tab").forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    $("character-panel").setAttribute("aria-labelledby", tab.id);
    if (focus) tab.focus();
    renderTable();
  }

  function exportReport() {
    analyze();
    const { left, right, comparison } = current;
    const hasBoth = left.text.length > 0 && right.text.length > 0;
    const settings = options();
    const lines = ["OPERASYON MERKEZİ · SMS KARŞILAŞTIRMA RAPORU", new Date().toLocaleString("tr-TR"), "", "KARŞILAŞTIRMA", "Durum: " + (!hasBoth ? "İkinci metin bekleniyor" : comparison.equal ? comparison.exactEqual ? "Metinler birebir aynı" : "Ayarlara göre eşit (ham metinler farklı)" : "Metinler farklı"), "Benzerlik: " + (hasBoth ? (comparison.diffApproximate ? "Yaklaşık " : "") + similarityLabel(comparison) : "Hesaplanmadı"), "Fark adedi: " + (hasBoth ? (comparison.diffApproximate ? "Yaklaşık " : "") + comparison.differenceCount : "Hesaplanmadı"), "Boşlukları yok say: " + (settings.ignoreWhitespace ? "Evet (tüm Unicode whitespace)" : "Hayır"), "Büyük/küçük harfi yok say: " + (settings.ignoreCase ? "Evet (Türkçe kurallar)" : "Hayır"), ""];
    sides.forEach((side) => {
      const data = current[side];
      lines.push(side === "left" ? "SOL METİN (A)" : "SAĞ METİN (B)", "Karakter (Unicode kod noktası): " + data.characters, "UTF-16 birimi: " + data.utf16Length, "UTF-8 bayt: " + data.utf8Bytes, "ASCII: " + (!data.text ? "Boş metin" : data.isAscii ? "Uyumlu" : "Uyumlu değil"), "Kodlama: " + (data.text ? data.encoding : "—"), "Tahmini SMS parçası: " + data.segments, "ASCII dışı karakterler: " + data.nonAscii.length);
      data.nonAscii.forEach((entry) => lines.push("  " + entry.position + ". karakter | " + entry.display + " | " + entry.unicode + " | Satır " + entry.line + ", sütun " + entry.column));
      lines.push("Görünmez / kontrol karakterleri: " + data.warnings.length);
      data.warnings.forEach((entry) => lines.push("  " + entry.position + ". karakter | " + entry.display + " | " + entry.unicode + " | Satır " + entry.line + ", sütun " + entry.column));
      lines.push("", "--- Metin başlangıcı ---", data.text, "--- Metin sonu ---", "");
    });
    lines.push("NOTLAR", "ASCII aralığı: U+0000–U+007F. ASCII uyumluluğu ve GSM-7 kodlaması farklıdır.", "Standart GSM-7: 160 / çok parçalı 153 septet. Unicode: 70 / çok parçalı 67 UTF-16 birimi.", "GSM genişletilmiş karakterler 2 septet; BMP dışı emojiler 2 UTF-16 birimi kullanır.", "SMS sayısı tahminidir; operatörün kodlama ve ulusal dil tablolarına göre değişebilir.", "Benzerlik, ortak karakter dizisi üzerinden hesaplanır. Fark adedinde bir değiştirme 1 fark sayılır.", "Uzun ve çok farklı metinlerde fark/benzerlik yaklaşık olabilir. Eşitlik kontrolü kesindir.", "Metinler HTML textarea kuralları gereği satır sonlarını LF olarak işler; CRLF ve LF kaynak dosya ayrımı korunmaz.");
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sms-karsilastirma-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Karşılaştırma raporu hazırlandı.");
  }

  const dialogs = {
    guide: { title: "Karakterlerin dilini anlayın.", icon: "book", content: '<h3>ASCII kontrolü</h3><p>ASCII, <code>U+0000–U+007F</code> aralığındaki 128 kodu kapsar. İngilizce harfler, rakamlar ve temel noktalama işaretleri bu aralıktadır. <code>ç ğ ı İ ö ş ü</code> gibi Türkçe karakterler ASCII dışındadır. Satır sonu ve sekme ASCII kontrol karakterleridir; ayrı sekmede listelenir.</p><h3>ASCII ve GSM-7 aynı şey değildir</h3><p>SMS için standart GSM-7 alfabesi kullanılır. Örneğin <code>ö</code> ASCII dışında olsa da GSM-7 içindedir. <code>€ ^ { } \\ [ ] ~ |</code> ve form feed, GSM-7 genişletilmiş tablosunda yer alır ve 2 septet kullanır.</p><h3>SMS adedi nasıl hesaplanır?</h3><p>GSM-7 için tek parça 160, çok parçalı SMS için parça başına 153 septet; Unicode için 70 ve 67 UTF-16 birimi esas alınır. Çoğu emoji 2 UTF-16 birimi kullanır. Emoji birleşimleri daha fazla birim kullanabilir.</p><p class="dialog-note">SMS adedi standart alfabe üzerinden bir tahmindir. Operatörün ulusal dil tabloları, kodlama dönüşümleri ve ek başlıkları sonucu değiştirebilir.</p><h3>Konum ve görünmez karakterler</h3><p>Konumlar 1’den başlar ve Unicode kod noktalarını sayar. Birleşik emojiler birden fazla karakter içerebilir. Görünmez / kontrol sekmesi satır sonlarını, sekmeleri, özel boşlukları ve sıfır genişlikli karakterleri listeler.</p>' },
    help: { title: "İki metin. Eksiksiz kontrol.", icon: "help", content: '<ol><li>Referans SMS metnini sol alana, karşılaştırılacak metni sağ alana yazın veya yapıştırın.</li><li>Eşitlik, ASCII uyumluluğu ve benzerlik yazarken otomatik güncellenir. Sol metindeki farklar pembe, sağ metindeki farklar yeşil renkte vurgulanır.</li><li>Karakter analizi bölümünde sorunlu karakterin Unicode kodunu, sırasını, satırını ve sütununu inceleyin.</li><li>İsterseniz boşlukları veya harf büyüklüğünü yok sayın. Tam sonuçları “Rapor indir” ile kaydedin.</li></ol><h3>Karşılaştırma seçenekleri</h3><p>Varsayılan kontrol tüm karakterleri, boşlukları ve satır sonlarını dikkate alır. Boşlukları yok say seçeneği Unicode boşluklarını, sekmeleri ve satır sonlarını kaldırarak karşılaştırır. Harf karşılaştırması Türkçe kuralları kullanır: <code>I ↔ ı</code>, <code>İ ↔ i</code>. Renkli vurgular her zaman ham metne aittir.</p><h3>Benzerlik ve sınırlar</h3><p>Benzerlik ortak karakter dizisine göre hesaplanır; anlam benzerliği ölçülmez. Her alan en fazla 10.000 UTF-16 birimi alır. Çok farklı uzun metinlerde fark sayısı ve benzerlik yaklaşık olabilir; bu durumda ayrıca bilgi gösterilir.</p><p class="dialog-note">Tarayıcı metin alanları CRLF satır sonlarını LF’ye dönüştürür. Görsel olarak aynı görünen farklı Unicode dizileri otomatik birleştirilmez. Tüm analiz cihazınızda yapılır; veriler saklanmaz.</p>' }
  };

  sides.forEach((side) => {
    const input = $(side + "-text");
    input.addEventListener("input", () => {
      clearTimeout(analysisTimer);
      analysisTimer = setTimeout(analyze, 100);
    });
    input.addEventListener("scroll", () => {
      $(side + "-highlight").scrollTop = input.scrollTop;
      $(side + "-highlight").scrollLeft = input.scrollLeft;
    });
    input.addEventListener("paste", (event) => {
      if (!event.clipboardData) return;
      const pasted = event.clipboardData.getData("text");
      const available = 10000 - input.value.length + input.selectionEnd - input.selectionStart;
      if (pasted.length > available) notify("Yapıştırılan metin 10.000 UTF-16 birimlik giriş sınırına kısaltılacak.");
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const side = button.dataset.side;
      const input = $(side + "-text");
      if (button.dataset.action === "clear") { input.value = ""; analyze(); input.focus(); return; }
      if (button.dataset.action === "copy") {
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard-unavailable");
          await navigator.clipboard.writeText(input.value);
          notify((side === "left" ? "Sol" : "Sağ") + " metin kopyalandı.");
        } catch (_) {
          input.focus(); input.select();
          notify("Metin seçildi. Kopyalamak için Ctrl+C veya ⌘C kullanın.");
        }
      } else {
        try {
          if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("clipboard-unavailable");
          const clipboard = await navigator.clipboard.readText();
          if (!clipboard) { notify("Panoda yapıştırılacak bir metin bulunamadı."); return; }
          setInput(side, clipboard); analyze(); input.focus();
        } catch (_) {
          input.focus();
          notify("Panoyu yapıştırmak için Ctrl+V veya ⌘V kullanın.");
        }
      }
    });
  });

  ["ignore-whitespace", "ignore-case", "highlight-differences", "highlight-nonascii"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("change", analyze);
  });
  $("side-filter").addEventListener("change", renderTable);
  document.querySelectorAll(".analysis-tab").forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab, false));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? $("tab-nonascii") : event.key === "End" ? $("tab-invisible") : $(activeTab === "nonascii" ? "tab-invisible" : "tab-nonascii");
      selectTab(next, true);
    });
  });
  $("load-example").addEventListener("click", () => {
    setInput("left", "Merhaba Deniz,\n\n2048 numarali siparisiniz kargoya verildi.\nTeslimat kodunuz: 4826\n\nIyi gunler dileriz.");
    setInput("right", "Merhaba Deniz,\n\n2048 numaralı siparişiniz kargoya verildi.\nTeslimat kodunuz: 4829\n\nİyi günler dileriz.");
    analyze();
    notify("Örnek SMS metinleri yüklendi. Farkları inceleyebilirsiniz.");
  });
  $("clear-all").addEventListener("click", () => {
    sides.forEach((side) => { $(side + "-text").value = ""; });
    analyze(); $("left-text").focus(); notify("Her iki metin temizlendi.");
  });
  $("swap-texts").addEventListener("click", () => {
    const left = $("left-text").value;
    $("left-text").value = $("right-text").value;
    $("right-text").value = left;
    analyze(); notify("Sol ve sağ metinlerin yeri değiştirildi.");
  });
  $("export-report").addEventListener("click", exportReport);
  document.querySelectorAll("[data-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const data = dialogs[button.dataset.dialog];
      setText("dialog-title", data.title);
      $("dialog-icon").setAttribute("href", "#i-" + data.icon);
      // Trusted static help content only. User-provided SMS is always rendered as text.
      $("dialog-content").innerHTML = data.content;
      $("info-dialog").showModal();
    });
  });
  ["close-dialog", "dialog-done"].forEach((id) => $(id).addEventListener("click", () => $("info-dialog").close()));
  $("info-dialog").addEventListener("click", (event) => {
    if (event.target !== $("info-dialog")) return;
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); analyze(); }
  });

  function setView(view) {
    document.querySelectorAll(".workspace-view").forEach((section) => {
      const active = section.dataset.view === view;
      section.hidden = !active;
      section.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-view-link]").forEach((link) => {
      const active = link.dataset.viewLink === view;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const crumb = document.querySelector(".breadcrumb span:last-child");
    if (crumb) {
      if (view === "xml") crumb.textContent = "XML Karşılaştırma";
      else if (view === "converter") crumb.textContent = "Ölçü Birimi Dönüştürücü";
      else if (view === "fee") crumb.textContent = "Ücret Hesaplama";
      else crumb.textContent = "SMS Karşılaştırma";
      document.title = crumb.textContent + " · Operasyon Merkezi";
    }
  }

  const feeFormatter = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  });
  const feeInputs = ["fee-value1", "fee-value2", "fee-value3"].map($);

  function parseFeeAmount(value) {
    const expression = value.trim();
    if (!expression) return 0;
    const parts = expression.split("/").map((part) => part.trim());
    if (parts.length > 2 || parts.some((part) => !part)) return null;
    const values = parts.map((part) => {
      let normalized;
      if (/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(part)) {
        normalized = part.replace(",", ".");
      } else if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(part)) {
        normalized = part.replace(/\./g, "").replace(",", ".");
      } else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(part)) {
        normalized = part.replace(/,/g, "");
      } else {
        return NaN;
      }
      return Number(normalized);
    });
    if (values.some((value) => !Number.isFinite(value)) || values[1] === 0) return null;
    const result = values.length === 2 ? values[0] / values[1] : values[0];
    return Number.isFinite(result) ? result : null;
  }

  function calculateFee() {
    const values = feeInputs.map((input) => parseFeeAmount(input.value));
    feeInputs.forEach((input, index) => {
      input.setAttribute("aria-invalid", String(values[index] === null));
    });

    if (values.some((value) => value === null)) {
      setText("fee-error", "Geçerli bir sayı veya bölme işlemi girin. Bölen sıfır olamaz.");
      ["fee-subtotal", "fee-result", "fee-subtotal-title", "fee-result-title"].forEach((id) => setText(id, "-"));
      setText("fee-status-title", "Girdi hatası");
      setText("fee-status-detail", "Hatalı alanı düzeltin");
      $("fee-progress").style.width = "35%";
      return;
    }

    const subtotal = values[0] + values[1] + values[2];
    const result = (values[0] + values[1]) * 1.3 + values[2] * 1.2;
    if (!Number.isFinite(subtotal) || !Number.isFinite(result)) {
      setText("fee-error", "Tutar hesaplama sınırını aşıyor. Daha küçük bir değer girin.");
      ["fee-subtotal", "fee-result", "fee-subtotal-title", "fee-result-title"].forEach((id) => setText(id, "-"));
      setText("fee-status-title", "Limit aşıldı");
      setText("fee-status-detail", "Daha küçük tutarlar deneyin");
      $("fee-progress").style.width = "35%";
      return;
    }

    const subtotalText = feeFormatter.format(subtotal);
    const resultText = feeFormatter.format(result);
    setText("fee-error", "");
    setText("fee-subtotal", subtotalText);
    setText("fee-result", resultText);
    setText("fee-subtotal-title", subtotalText);
    setText("fee-result-title", resultText);
    const filledCount = feeInputs.filter((input) => input.value.trim()).length;
    setText("fee-status-title", filledCount ? "Hesaplandı" : "Hazır");
    setText("fee-status-detail", filledCount ? filledCount + " alan üzerinden anlık sonuç" : "Geçerli tutar veya bölme işlemi girin");
    $("fee-progress").style.width = filledCount ? Math.max(34, filledCount * 33) + "%" : "0%";
  }

  function xmlInput(side) {
    return $("xml-" + side + "-text");
  }

  function xmlSetText(side, text) {
    xmlInput(side).value = String(text || "").slice(0, 200000);
  }

  function renderXmlSide(side, parsed) {
    const text = xmlInput(side).value;
    setText("xml-" + side + "-length", number.format(text.length));
    const badge = $("xml-" + side + "-valid");
    badge.className = "encoding-badge" + (text ? (parsed.ok ? " good" : " warning") : "");
    badge.textContent = !text ? "XML bekleniyor" : parsed.ok ? "Gecerli XML" : "XML hatasi";
    document.querySelectorAll('[data-xml-side="' + side + '"]').forEach((button) => { button.disabled = !text; });
  }

  function renderXmlHighlights(side, runs) {
    const layer = $("xml-" + side + "-highlight");
    layer.replaceChildren();
    const fragment = document.createDocumentFragment();
    runs.forEach((run) => {
      if (run.type === "equal") fragment.append(document.createTextNode(run.text));
      else {
        const mark = document.createElement("mark");
        mark.className = run.type;
        mark.textContent = run.text;
        fragment.append(mark);
      }
    });
    fragment.append(document.createTextNode("\n"));
    layer.append(fragment);
    layer.scrollTop = xmlInput(side).scrollTop;
    layer.scrollLeft = xmlInput(side).scrollLeft;
  }

  function renderXmlTable(differences) {
    const table = $("xml-diff-table");
    const empty = $("xml-analysis-empty");
    table.hidden = differences.length === 0;
    empty.hidden = differences.length > 0;
    setText("xml-issue-count", number.format(differences.length));
    setText("xml-diff-count", number.format(differences.length));
    if (!differences.length) {
      const hasBoth = xmlInput("left").value && xmlInput("right").value;
      setText("xml-empty-title", hasBoth ? "XML yapilari ayni gorunuyor." : "XML farklari burada listelenir.");
      setText("xml-empty-detail", hasBoth ? "Gecerli iki XML arasinda node, attribute veya text farki bulunmadi." : "Iki gecerli XML eklendiginde degisen node, attribute ve text degerleri gorunur.");
    }
    const fragment = document.createDocumentFragment();
    differences.slice(0, 300).forEach((diff) => {
      const row = document.createElement("tr");
      row.className = "xml-row-" + diff.status;
      ["status", "path", "type", "left", "right"].forEach((field) => {
        const cell = document.createElement("td");
        if (field === "status") {
          const badge = document.createElement("span");
          badge.className = "xml-status-badge " + diff.status;
          badge.textContent = diff.status === "added" ? "Eklendi" : diff.status === "removed" ? "Silindi" : "Degisti";
          cell.append(badge);
        } else {
          cell.textContent = diff[field] || "-";
        }
        row.append(cell);
      });
      fragment.append(row);
    });
    $("xml-diff-table-body").replaceChildren(fragment);
  }

  function analyzeXml() {
    clearTimeout(xmlTimer);
    const leftText = xmlInput("left").value;
    const rightText = xmlInput("right").value;
    currentXml = xmlEngine.compare(leftText, rightText);
    renderXmlSide("left", currentXml.left);
    renderXmlSide("right", currentXml.right);
    const hasLeft = leftText.length > 0;
    const hasRight = rightText.length > 0;
    const hasBoth = hasLeft && hasRight;
    const bothValid = currentXml.left.ok && currentXml.right.ok;
    let title = "Karsilastirmaya hazir";
    let detail = "Iki XML dosyasi yukleyin veya metin yapistirin";
    let status = "";
    if (hasLeft || hasRight) {
      if (!hasBoth) {
        title = hasLeft ? "Sag XML bekleniyor" : "Sol XML bekleniyor";
        detail = "Karsilastirma icin diger XML'i ekleyin";
      } else if (!bothValid) {
        title = "XML okunamadi";
        detail = [currentXml.left.ok ? "" : "Sol XML hatali", currentXml.right.ok ? "" : "Sag XML hatali"].filter(Boolean).join(" · ");
        status = "warning";
      } else if (currentXml.textComparison.equal) {
        title = "XML yapilari ayni";
        detail = "Canonical gorunumde fark bulunmadi";
        status = "good";
      } else {
        title = "XML farklari bulundu";
        detail = number.format(currentXml.differences.length) + " fark kalemi listelendi";
        status = "warning";
      }
    }
    setText("xml-status-title", title);
    setText("xml-status-detail", detail);
    setText("xml-diff-detail", bothValid ? "Node, attribute ve text farklari" : "Gecerli iki XML bekleniyor");
    $("xml-status-indicator").className = "summary-indicator " + status;
    $("xml-status-icon").className = "summary-icon " + (status === "good" ? "mint" : status === "warning" ? "amber" : "lavender");
    setText("xml-similarity-title", hasBoth ? "%" + number.format(currentXml.textComparison.similarity) : "-");
    setText("xml-similarity-caption", bothValid ? "Canonical XML" : "Henüz hesaplanmadi");
    $("xml-similarity-progress").style.width = hasBoth ? currentXml.textComparison.similarity + "%" : "0%";
    $("xml-export-report").disabled = !(hasLeft || hasRight);
    $("xml-clear-all").disabled = !(hasLeft || hasRight);
    $("xml-swap-texts").disabled = !(hasLeft || hasRight);
    renderXmlHighlights("left", hasBoth ? currentXml.textComparison.leftRuns : []);
    renderXmlHighlights("right", hasBoth ? currentXml.textComparison.rightRuns : []);
    renderXmlTable(bothValid ? currentXml.differences : []);
    $("xml-comparison-note").hidden = bothValid || !hasBoth;
    setText("xml-comparison-note", bothValid || !hasBoth ? "" : "XML parse hatasi duzeltildiginde yapisal fark listesi otomatik guncellenir.");
  }

  function exportXmlReport() {
    analyzeXml();
    const lines = ["OPERASYON MERKEZİ · XML KARŞILAŞTIRMA RAPORU", new Date().toLocaleString("tr-TR"), "", "OZET", "Durum: " + $("xml-status-title").textContent, "Fark kalemi: " + (currentXml ? currentXml.differences.length : 0), "Benzerlik: " + $("xml-similarity-title").textContent, ""];
    if (currentXml && currentXml.differences.length) {
      lines.push("FARK LISTESI");
      currentXml.differences.forEach((diff) => {
        lines.push([diff.status.toUpperCase(), diff.type, diff.path, "Sol: " + (diff.left || "-"), "Sag: " + (diff.right || "-")].join(" | "));
      });
      lines.push("");
    }
    lines.push("SOL XML", currentXml ? currentXml.leftCanonical : xmlInput("left").value, "", "SAG XML", currentXml ? currentXml.rightCanonical : xmlInput("right").value);
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xml-karsilastirma-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("XML karsilastirma raporu hazirlandi.");
  }

  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setView(link.dataset.viewLink);
      history.replaceState(null, "", link.getAttribute("href"));
      if (mobileMenu.matches) {
        setSidebarCollapsed(true);
        $("main").focus({ preventScroll: true });
      }
    });
  });

  sides.forEach((side) => {
    xmlInput(side).addEventListener("input", () => {
      clearTimeout(xmlTimer);
      xmlTimer = setTimeout(analyzeXml, 120);
    });
    xmlInput(side).addEventListener("scroll", () => {
      $("xml-" + side + "-highlight").scrollTop = xmlInput(side).scrollTop;
      $("xml-" + side + "-highlight").scrollLeft = xmlInput(side).scrollLeft;
    });
    $("xml-" + side + "-file").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      xmlSetText(side, await file.text());
      analyzeXml();
      notify((side === "left" ? "Sol" : "Sag") + " XML yuklendi.");
      event.target.value = "";
    });
  });

  document.querySelectorAll("[data-xml-action]").forEach((button) => {
    button.addEventListener("click", () => {
      xmlSetText(button.dataset.xmlSide, "");
      analyzeXml();
      xmlInput(button.dataset.xmlSide).focus();
    });
  });

  $("xml-load-example").addEventListener("click", () => {
    xmlSetText("left", '<smsCampaign id="1001">\n  <name>Selfy Welcome</name>\n  <sender>TTMOBIL</sender>\n  <message lang="tr">Hos geldiniz. Paketiniz aktif.</message>\n  <validity days="30"/>\n</smsCampaign>');
    xmlSetText("right", '<smsCampaign id="1001">\n  <name>Selfy Welcome</name>\n  <sender>TTMOBIL</sender>\n  <message lang="tr">Hos geldiniz. Paketiniz aktif edildi.</message>\n  <validity days="45"/>\n  <channel>SMS</channel>\n</smsCampaign>');
    analyzeXml();
    notify("Ornek XML dosyalari yuklendi.");
  });
  $("xml-clear-all").addEventListener("click", () => {
    sides.forEach((side) => xmlSetText(side, ""));
    analyzeXml();
    xmlInput("left").focus();
    notify("XML alanlari temizlendi.");
  });
  $("xml-swap-texts").addEventListener("click", () => {
    const left = xmlInput("left").value;
    xmlSetText("left", xmlInput("right").value);
    xmlSetText("right", left);
    analyzeXml();
    notify("Sol ve sag XML yer degistirdi.");
  });
  $("xml-export-report").addEventListener("click", exportXmlReport);

  $("fee-calculator").addEventListener("submit", (event) => {
    event.preventDefault();
    calculateFee();
  });
  feeInputs.forEach((input) => {
    input.addEventListener("input", calculateFee);
  });
  $("fee-clear").addEventListener("click", () => {
    feeInputs.forEach((input) => { input.value = ""; });
    calculateFee();
    feeInputs[0].focus();
    notify("Ücret hesaplama alanları temizlendi.");
  });
  $("fee-load-example").addEventListener("click", () => {
    $("fee-value1").value = "10";
    $("fee-value2").value = "20";
    $("fee-value3").value = "5";
    calculateFee();
    notify("Örnek ücret değerleri yüklendi.");
  });

  const initialView = location.hash === "#xml-view" ? "xml" : location.hash === "#converter-view" ? "converter" : location.hash === "#fee-view" ? "fee" : "sms";
  setView(initialView);
  analyze();
  analyzeXml();
  calculateFee();
})();
