dcconst form = document.querySelector("#calculator");
    const error = document.querySelector("#error");
    const subtotal = document.querySelector("#subtotal");
    const result = document.querySelector("#result");
    const inputs = [
      document.querySelector("#value1"),
      document.querySelector("#value2"),
      document.querySelector("#value3")
    ];

    const formatter = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6
    });

    function parseAmount(value) {
      const expression = value.trim();
      if (!expression) {
        return 0;
      }

      const parts = expression.split("/").map((part) => part.trim());
      if (parts.length > 2 || parts.some((part) => !part)) {
        return null;
      }

      const numbers = parts.map((part) => {
        let normalized;
        // A single separator is decimal; validate grouping before removing it.
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
      if (numbers.some((number) => !Number.isFinite(number)) || numbers[1] === 0) {
        return null;
      }

      const number = numbers.length === 2 ? numbers[0] / numbers[1] : numbers[0];
      return Number.isFinite(number) ? number : null;
    }

    function calculate() {
      error.textContent = "";
      const values = inputs.map((input) => parseAmount(input.value));
      inputs.forEach((input, index) => {
        input.setAttribute("aria-invalid", String(values[index] === null));
      });

      if (values.some((value) => value === null)) {
        error.textContent = "Ge\u00e7erli bir say\u0131 veya b\u00f6lme i\u015flemi girin. B\u00f6len s\u0131f\u0131r olamaz.";
        subtotal.textContent = "-";
        result.textContent = "-";
        return;
      }

      const untaxedPrice = values[0] + values[1] + values[2];
      const netPrice = (values[0] + values[1]) * 1.3 + values[2] * 1.2;
      if (!Number.isFinite(untaxedPrice) || !Number.isFinite(netPrice)) {
        error.textContent = "Tutar hesaplama s\u0131n\u0131r\u0131n\u0131 a\u015f\u0131yor. Daha k\u00fc\u00e7\u00fck bir de\u011fer girin.";
        subtotal.textContent = "-";
        result.textContent = "-";
        return;
      }

      subtotal.textContent = formatter.format(untaxedPrice);
      result.textContent = formatter.format(netPrice);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      calculate();
    });

    inputs.forEach((input) => {
      input.addEventListener("input", calculate);
    });

    document.querySelector("#clear").addEventListener("click", () => {
      inputs.forEach((input) => {
        input.value = "";
      });
      calculate();
      inputs[0].focus();
    });
