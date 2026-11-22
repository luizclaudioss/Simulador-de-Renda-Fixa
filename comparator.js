(() => {
  const COLORS = ["#38bdf8", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

  const liveInit = window.LIVE_RATES || { cdi: 13.65, ipca12m: 4.63 };

  const compState = {
    cdi: liveInit.cdi,
    ipca: liveInit.ipca12m,
    termVal: 24,
    termUnit: "months", // months | days
    amount: 10000,
    eqType: "cdi_pct",
    eqRate: 100,
    eqTax: "ir",
    offers: [
      { id: 1, name: "CDB Pós-fixado", type: "cdi_pct", rate: 115, tax: "ir", color: COLORS[0] },
      { id: 2, name: "LCI / LCA Isenta", type: "cdi_pct", rate: 94, tax: "exempt", color: COLORS[1] },
      { id: 3, name: "CDB Prefixado", type: "pre", rate: 14.5, tax: "ir", color: COLORS[2] },
      { id: 4, name: "Tesouro IPCA+", type: "ipca_plus", rate: 7.0, tax: "ir", color: COLORS[3] },
    ],
    nextId: 5,
    chart: null,
  };

  function getIrRate() {
    if (compState.termUnit === "days") {
      if (compState.termVal <= 180) return 0.225;
      if (compState.termVal <= 360) return 0.20;
      if (compState.termVal <= 720) return 0.175;
      return 0.15;
    }
    if (compState.termVal <= 6) return 0.225;
    if (compState.termVal <= 12) return 0.20;
    if (compState.termVal < 24) return 0.175;
    return 0.15;
  }

  function getTermYears() {
    return compState.termUnit === "days" ? compState.termVal / 365 : compState.termVal / 12;
  }

  function formatTermLabel() {
    if (compState.termUnit === "days") {
      return `${compState.termVal} ${compState.termVal === 1 ? "dia" : "dias"}`;
    }
    return `${compState.termVal} ${compState.termVal === 1 ? "mês" : "meses"}`;
  }

  function formatPct(val, decimals = 2) {
    return (
      val.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + "%"
    );
  }

  function formatBRL(val) {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function calcAnnualGross(type, rate, cdiPct, ipcaPct) {
    const cdi = cdiPct / 100;
    const ipca = ipcaPct / 100;
    if (type === "cdi_pct") return cdi * (rate / 100);
    if (type === "pre") return rate / 100;
    return (1 + ipca) * (1 + rate / 100) - 1;
  }

  function evaluateOption(type, rate, tax) {
    const t = getTermYears();
    const ir = tax === "exempt" ? 0 : getIrRate();
    const annualGross = calcAnnualGross(type, rate, compState.cdi, compState.ipca);
    const grossFactor = Math.pow(1 + annualGross, t);
    const netFactor = 1 + (grossFactor - 1) * (1 - ir);
    const annualNet = Math.pow(netFactor, 1 / t) - 1;
    const realAnnualNet = (1 + annualNet) / (1 + compState.ipca / 100) - 1;
    const finalNet = compState.amount * netFactor;

    // Equivalent % of CDI (taxed with IR)
    const irStd = getIrRate();
    const reqGrossFactor = 1 + (netFactor - 1) / (1 - irStd);
    const reqAnnualGross = Math.pow(reqGrossFactor, 1 / t) - 1;
    const equivCdiTaxed = compState.cdi > 0 ? (reqAnnualGross / (compState.cdi / 100)) * 100 : 0;

    return {
      ir,
      annualGross,
      grossFactor,
      netFactor,
      netPeriodPct: (netFactor - 1) * 100,
      annualNetPct: annualNet * 100,
      realAnnualNetPct: realAnnualNet * 100,
      finalNet,
      equivCdiTaxed,
    };
  }

  function grossRatesForNetFactor(netFactor, irRate) {
    const t = getTermYears();
    const reqGrossFactor = 1 + (netFactor - 1) / (1 - irRate);
    const reqAnnualGross = Math.pow(reqGrossFactor, 1 / t) - 1;
    const cdi = compState.cdi / 100;
    const ipca = compState.ipca / 100;

    return {
      cdiPct: cdi > 0 ? (reqAnnualGross / cdi) * 100 : 0,
      prePct: reqAnnualGross * 100,
      ipcaPlusPct: ((1 + reqAnnualGross) / (1 + ipca) - 1) * 100,
    };
  }

  function formatTypeLabel(type, rate) {
    const r = Number(rate).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    if (type === "cdi_pct") return `${r}% CDI`;
    if (type === "pre") return `Pré ${r}% a.a.`;
    return `IPCA + ${r}%`;
  }

  // DOM refs
  const cdiEl = document.getElementById("compCdi");
  const ipcaEl = document.getElementById("compIpca");
  const monthsEl = document.getElementById("compMonths");
  const amountEl = document.getElementById("compAmount");
  const eqTypeEl = document.getElementById("eqType");
  const eqRateEl = document.getElementById("eqRate");
  const eqTaxEl = document.getElementById("eqTax");
  const eqTermValEl = document.getElementById("eqTermVal");
  const eqTermUnitEl = document.getElementById("eqTermUnit");
  const compTermValEl = document.getElementById("compTermVal");
  const compTermUnitEl = document.getElementById("compTermUnit");
  const compIpcaProjEl = document.getElementById("compIpcaProj");
  const compCdiProjEl = document.getElementById("compCdiProj");
  const compLiveRatesEl = document.getElementById("compLiveRates");
  const eqGridEl = document.getElementById("eqGrid");
  const eqSubtitleEl = document.getElementById("eqSubtitle");
  const offersListEl = document.getElementById("offersList");
  const addOfferBtn = document.getElementById("addOfferBtn");
  const compChartSubEl = document.getElementById("compChartSub");

  function renderEquivalence() {
    const res = evaluateOption(compState.eqType, compState.eqRate, compState.eqTax);
    const irStd = getIrRate();
    const taxed = grossRatesForNetFactor(res.netFactor, irStd);
    const exempt = grossRatesForNetFactor(res.netFactor, 0);

    eqSubtitleEl.textContent = `Prazo de ${formatTermLabel()} (IR regressivo de ${(irStd * 100).toFixed(1).replace(".", ",")}% sobre tributados) • CDI ${formatPct(compState.cdi)} | IPCA ${formatPct(compState.ipca)}`;

    const cards = [
      {
        label: "Rendimento Líquido",
        val: `${formatPct(res.annualNetPct)} a.a.`,
        sub: `${formatPct(res.netPeriodPct)} no período • ${formatBRL(res.finalNet)}`,
      },
      {
        label: "Equiv. % do CDI (c/ IR)",
        val: `${formatPct(taxed.cdiPct, 1)} do CDI`,
        sub: `Isento: ${formatPct(exempt.cdiPct, 1)} do CDI`,
      },
      {
        label: "Equiv. Prefixado (c/ IR)",
        val: `${formatPct(taxed.prePct)} a.a.`,
        sub: `Isento: ${formatPct(exempt.prePct)} a.a.`,
      },
      {
        label: "Equiv. IPCA+ (c/ IR)",
        val: `IPCA + ${formatPct(taxed.ipcaPlusPct)}`,
        sub: `Isento: IPCA + ${formatPct(exempt.ipcaPlusPct)}`,
      },
    ];

    eqGridEl.innerHTML = cards
      .map(
        (c) => `
      <div class="eq-card">
        <span class="eq-card-label">${c.label}</span>
        <span class="eq-card-val">${c.val}</span>
        <span class="eq-card-sub">${c.sub}</span>
      </div>
    `
      )
      .join("");
  }

  function renderOffersEditor() {
    offersListEl.innerHTML = "";
    compState.offers.forEach((offer) => {
      const row = document.createElement("div");
      row.className = "offer-row";
      row.style.setProperty("--offer-color", offer.color);
      row.innerHTML = `
        <input type="text" class="offer-name" value="${offer.name}" aria-label="Nome do investimento" />
        <select class="offer-type" aria-label="Indexador">
          <option value="cdi_pct" ${offer.type === "cdi_pct" ? "selected" : ""}>% do CDI</option>
          <option value="pre" ${offer.type === "pre" ? "selected" : ""}>Pré (% a.a.)</option>
          <option value="ipca_plus" ${offer.type === "ipca_plus" ? "selected" : ""}>IPCA + (% a.a.)</option>
        </select>
        <input type="number" class="offer-rate" step="0.1" value="${offer.rate}" aria-label="Taxa" />
        <label class="offer-exempt-check">
          <input type="checkbox" class="offer-tax-check" ${offer.tax === "exempt" ? "checked" : ""} />
          <span>Isento de IR</span>
        </label>
        <button type="button" class="remove-offer-btn" title="Remover">✕</button>
      `;

      row.querySelector(".offer-name").addEventListener("input", (e) => {
        offer.name = e.target.value || "Opção";
        renderComparisonOutputs();
      });
      row.querySelector(".offer-type").addEventListener("change", (e) => {
        offer.type = e.target.value;
        renderComparisonOutputs();
      });
      row.querySelector(".offer-rate").addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isFinite(v)) return;
        offer.rate = v;
        renderComparisonOutputs();
      });
      row.querySelector(".offer-tax-check").addEventListener("change", (e) => {
        offer.tax = e.target.checked ? "exempt" : "ir";
        renderComparisonOutputs();
      });
      row.querySelector(".remove-offer-btn").addEventListener("click", () => {
        if (compState.offers.length <= 1) return;
        compState.offers = compState.offers.filter((o) => o.id !== offer.id);
        renderOffersEditor();
        renderComparisonOutputs();
      });

      offersListEl.appendChild(row);
    });
  }

  function renderComparisonOutputs() {
    const evaluated = compState.offers
      .map((o) => ({
        ...o,
        ...evaluateOption(o.type, o.rate, o.tax),
      }))
      .sort((a, b) => b.finalNet - a.finalNet);

    const bestNet = evaluated.length ? evaluated[0].finalNet : 0;

    // Table
    const tbody = document.querySelector("#compTable tbody");
    tbody.innerHTML = evaluated
      .map((item, idx) => {
        const isWinner = idx === 0;
        const diff = item.finalNet - bestNet;
        const diffText = isWinner ? "" : ` (${formatBRL(diff)})`;
        return `
          <tr>
            <td>${item.name}${isWinner ? '<span class="winner-badge">Melhor</span>' : ""}</td>
            <td>${formatTypeLabel(item.type, item.rate)}</td>
            <td>${item.ir === 0 ? "Isento" : formatPct(item.ir * 100, 1)}</td>
            <td>${formatPct(item.annualNetPct)}</td>
            <td>${formatPct(item.equivCdiTaxed, 1)}</td>
            <td class="${isWinner ? "best-cell" : ""}">${formatBRL(item.finalNet)}${diffText}</td>
          </tr>
        `;
      })
      .join("");

    // Chart
    compChartSubEl.textContent = `Aplicação de ${formatBRL(compState.amount)} por ${formatTermLabel()} • Rentabilidade líquida acumulada no período (%)`;

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--text-muted").trim();
    const gridColor = styles.getPropertyValue("--grid").trim();

    const ctx = document.getElementById("compChart").getContext("2d");
    if (compState.chart) compState.chart.destroy();

    compState.chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: evaluated.map((e) => e.name),
        datasets: [
          {
            label: "Retorno Líquido (%)",
            data: evaluated.map((e) => Number(e.netPeriodPct.toFixed(2))),
            backgroundColor: evaluated.map((e) => e.color),
            borderRadius: 8,
            barThickness: 28,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0a2540",
            titleColor: "#ffffff",
            bodyColor: "#e2e8f0",
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const item = evaluated[ctx.dataIndex];
                return ` Líquido: ${formatPct(item.netPeriodPct)} (${formatBRL(item.finalNet)})`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => `${Number(v).toLocaleString("pt-BR")}%`,
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { weight: "600" },
            },
          },
        },
      },
    });
  }

  function updateLiveRatesBadge() {
    if (compLiveRatesEl) {
      compLiveRatesEl.textContent = `CDI ${formatPct(compState.cdi)} • IPCA ${formatPct(compState.ipca)}`;
    }
  }

  function renderAllComparator() {
    updateLiveRatesBadge();
    renderEquivalence();
    renderComparisonOutputs();
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const isActive = b.dataset.tab === tabName;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `tab-${tabName}`);
    });
    const mobileTabSelect = document.getElementById("mobileTabSelect");
    if (mobileTabSelect) mobileTabSelect.value = tabName;
    if (tabName === "comparator") {
      renderComparisonOutputs();
    }
    window.dispatchEvent(new CustomEvent("tabchanged", { detail: tabName }));
  }

  function initComparator() {
    // Tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
    const mobileTabSelect = document.getElementById("mobileTabSelect");
    if (mobileTabSelect) {
      mobileTabSelect.addEventListener("change", () => switchTab(mobileTabSelect.value));
    }

    if (cdiEl) {
      cdiEl.addEventListener("input", () => {
        const v = parseFloat(cdiEl.value);
        if (!Number.isFinite(v) || v < 0) return;
        compState.cdi = v;
        renderAllComparator();
      });
    }

    if (ipcaEl) {
      ipcaEl.addEventListener("input", () => {
        const v = parseFloat(ipcaEl.value);
        if (!Number.isFinite(v) || v <= -100) return;
        compState.ipca = v;
        renderAllComparator();
      });
    }

    if (monthsEl) {
      monthsEl.addEventListener("input", () => {
        const v = parseInt(monthsEl.value, 10);
        if (!Number.isFinite(v) || v < 1) return;
        compState.months = v;
        document.querySelectorAll("#compTermPresets .seg-btn").forEach((b) => {
          b.classList.toggle("active", parseInt(b.dataset.m, 10) === v);
        });
        renderAllComparator();
      });
    }

    document.querySelectorAll("#compTermPresets .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#compTermPresets .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        compState.months = parseInt(btn.dataset.m, 10);
        if (monthsEl) monthsEl.value = compState.months;
        renderAllComparator();
      });
    });

    if (amountEl) {
      amountEl.addEventListener("input", () => {
        const v = parseFloat(amountEl.value);
        if (!Number.isFinite(v) || v <= 0) return;
        compState.amount = v;
        renderAllComparator();
      });
    }

    eqTypeEl.addEventListener("change", () => {
      compState.eqType = eqTypeEl.value;
      renderEquivalence();
    });
    eqRateEl.addEventListener("input", () => {
      const v = parseFloat(eqRateEl.value);
      if (!Number.isFinite(v)) return;
      compState.eqRate = v;
      renderEquivalence();
    });
    eqTaxEl.addEventListener("change", () => {
      compState.eqTax = eqTaxEl.value;
      renderEquivalence();
    });

    document.querySelectorAll("#compModeSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#compModeSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.compmode;
        document.getElementById("compViewEq").classList.toggle("active", mode === "eq");
        document.getElementById("compViewCompare").classList.toggle("active", mode === "compare");
        if (mode === "compare") {
          renderComparisonOutputs();
        }
      });
    });

    const syncTermInputs = () => {
      if (eqTermValEl) eqTermValEl.value = compState.termVal;
      if (eqTermUnitEl) eqTermUnitEl.value = compState.termUnit;
      if (compTermValEl) compTermValEl.value = compState.termVal;
      if (compTermUnitEl) compTermUnitEl.value = compState.termUnit;
    };

    const bindTermControls = (valEl, unitEl) => {
      if (valEl) {
        valEl.addEventListener("input", () => {
          const v = parseInt(valEl.value, 10);
          if (!Number.isFinite(v) || v < 1) return;
          compState.termVal = v;
          syncTermInputs();
          renderAllComparator();
        });
      }
      if (unitEl) {
        unitEl.addEventListener("change", () => {
          const prevUnit = compState.termUnit;
          compState.termUnit = unitEl.value;
          if (prevUnit !== compState.termUnit) {
            compState.termVal =
              compState.termUnit === "days"
                ? Math.round(compState.termVal * 30)
                : Math.max(1, Math.round(compState.termVal / 30));
          }
          syncTermInputs();
          renderAllComparator();
        });
      }
    };

    bindTermControls(eqTermValEl, eqTermUnitEl);
    bindTermControls(compTermValEl, compTermUnitEl);

    addOfferBtn.addEventListener("click", () => {
      const color = COLORS[(compState.nextId - 1) % COLORS.length];
      compState.offers.push({
        id: compState.nextId++,
        name: `Opção ${compState.nextId - 1}`,
        type: "cdi_pct",
        rate: 100,
        tax: "ir",
        color,
      });
      renderOffersEditor();
      renderComparisonOutputs();
    });

    let userEditedCompIpca = false;
    let userEditedCompCdi = false;

    if (compIpcaProjEl) {
      compIpcaProjEl.value = compState.ipca.toFixed(2);
      compIpcaProjEl.addEventListener("input", () => {
        const v = parseFloat(compIpcaProjEl.value);
        if (!Number.isFinite(v) || v <= -100) return;
        userEditedCompIpca = true;
        compState.ipca = v;
        renderAllComparator();
      });
    }

    if (compCdiProjEl) {
      compCdiProjEl.value = compState.cdi.toFixed(2);
      compCdiProjEl.addEventListener("input", () => {
        const v = parseFloat(compCdiProjEl.value);
        if (!Number.isFinite(v) || v < 0) return;
        userEditedCompCdi = true;
        compState.cdi = v;
        renderAllComparator();
      });
    }

    window.addEventListener("live-rates-updated", (e) => {
      if (!e.detail) return;
      if (!userEditedCompCdi && Number.isFinite(e.detail.cdi)) {
        compState.cdi = e.detail.cdi;
        if (compCdiProjEl) compCdiProjEl.value = compState.cdi.toFixed(2);
      }
      if (!userEditedCompIpca && Number.isFinite(e.detail.ipca12m)) {
        compState.ipca = e.detail.ipca12m;
        if (compIpcaProjEl) compIpcaProjEl.value = compState.ipca.toFixed(2);
      }
      renderAllComparator();
    });

    // Re-render comparator chart when theme changes
    document.getElementById("themeToggle").addEventListener("click", () => {
      setTimeout(() => renderComparisonOutputs(), 10);
    });

    renderOffersEditor();
    renderAllComparator();
  }

  initComparator();
})();
