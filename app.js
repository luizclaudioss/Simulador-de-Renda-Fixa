(() => {
  let DATA = Array.isArray(window.HISTORICAL_DATA) ? [...window.HISTORICAL_DATA] : [];

  const DEFAULT_RATES = {
    ipca1: 6.0,
    ipca2: 7.0,
    ipca3: 7.4,
    pre: 15.0,
  };

  const STORAGE_KEY = "cdi_ipca_custom_rates_v1";

  function loadRates() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        return {
          ipca1: Number.isFinite(Number(saved.ipca1)) ? Number(saved.ipca1) : DEFAULT_RATES.ipca1,
          ipca2: Number.isFinite(Number(saved.ipca2)) ? Number(saved.ipca2) : DEFAULT_RATES.ipca2,
          ipca3: Number.isFinite(Number(saved.ipca3)) ? Number(saved.ipca3) : DEFAULT_RATES.ipca3,
          pre: Number.isFinite(Number(saved.pre)) ? Number(saved.pre) : DEFAULT_RATES.pre,
        };
      }
    } catch (_) {}
    return { ...DEFAULT_RATES };
  }

  function saveRates(rates) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
    } catch (_) {}
  }

  function formatRateLabel(val) {
    return Number(val).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  const rates = loadRates();

  const SERIES_CONFIG = [
    {
      id: "pre15",
      get label() {
        return `Pré ${formatRateLabel(rates.pre)}%`;
      },
      color: "#d97706",
      visible: true,
      isBenchmark: false,
      monthlyFactor: () => Math.pow(1 + rates.pre / 100, 1 / 12),
    },
    {
      id: "ipca74",
      get label() {
        return `IPCA+${formatRateLabel(rates.ipca3)}%`;
      },
      color: "#635bff",
      visible: true,
      isBenchmark: false,
      monthlyFactor: (row) => (1 + row.ipca / 100) * Math.pow(1 + rates.ipca3 / 100, 1 / 12),
    },
    {
      id: "ipca7",
      get label() {
        return `IPCA+${formatRateLabel(rates.ipca2)}%`;
      },
      color: "#e11d48",
      visible: true,
      isBenchmark: false,
      monthlyFactor: (row) => (1 + row.ipca / 100) * Math.pow(1 + rates.ipca2 / 100, 1 / 12),
    },
    {
      id: "ipca6",
      get label() {
        return `IPCA+${formatRateLabel(rates.ipca1)}%`;
      },
      color: "#09825d",
      visible: true,
      isBenchmark: false,
      monthlyFactor: (row) => (1 + row.ipca / 100) * Math.pow(1 + rates.ipca1 / 100, 1 / 12),
    },
    {
      id: "cdi",
      label: "CDI",
      color: "#0284c7",
      visible: true,
      isBenchmark: false,
      monthlyFactor: (row) => 1 + row.cdi / 100,
    },
    {
      id: "ipca",
      label: "IPCA (Inflação)",
      color: "#94a3b8",
      visible: false,
      isBenchmark: true,
      dashed: true,
      monthlyFactor: (row) => 1 + row.ipca / 100,
    },
  ];

  const AMOUNT_STORAGE_KEY = "cdi_ipca_initial_amount_v1";

  function loadInitialAmount() {
    try {
      const val = parseFloat(localStorage.getItem(AMOUNT_STORAGE_KEY));
      if (Number.isFinite(val) && val > 0) return val;
    } catch (_) {}
    return 1000;
  }

  const state = {
    metric: "pct", // pct | brl | real | rolling12
    initialAmount: loadInitialAmount(),
    startIdx: 0,
    endIdx: Math.max(0, DATA.length - 1),
    chart: null,
  };

  const MONTH_NAMES = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  function formatMonthLabel(ym) {
    const [y, m] = ym.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]}/${y}`;
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

  let fullIndex = {};
  function rebuildFullIndex() {
    fullIndex = {};
    for (const s of SERIES_CONFIG) {
      const arr = [1.0];
      for (let i = 0; i < DATA.length; i++) {
        arr.push(arr[i] * s.monthlyFactor(DATA[i]));
      }
      fullIndex[s.id] = arr;
    }
  }
  rebuildFullIndex();

  // DOM refs
  const datePickerEl = document.getElementById("datePicker");
  const dateTriggerEl = document.getElementById("dateTrigger");
  const dateTriggerTextEl = document.getElementById("dateTriggerText");
  const datePopoverEl = document.getElementById("datePopover");
  const dpStartYearEl = document.getElementById("dpStartYear");
  const dpEndYearEl = document.getElementById("dpEndYear");
  const dpStartMonthsEl = document.getElementById("dpStartMonths");
  const dpEndMonthsEl = document.getElementById("dpEndMonths");
  const dpSummaryEl = document.getElementById("dpSummary");
  const dpDoneBtn = document.getElementById("dpDoneBtn");
  const seriesPillsEl = document.getElementById("seriesPills");
  const kpiGridEl = document.getElementById("kpiGrid");
  const chartTitleEl = document.getElementById("chartTitle");
  const chartSubtitleEl = document.getElementById("chartSubtitle");
  const headerSubtitleEl = document.getElementById("headerSubtitle");
  const syncStatusEl = document.getElementById("syncStatus");
  const syncTextEl = document.getElementById("syncText");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const downloadMainPngBtn = document.getElementById("downloadMainPngBtn");
  const themeToggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");

  const rateIpca1El = document.getElementById("rateIpca1");
  const rateIpca2El = document.getElementById("rateIpca2");
  const rateIpca3El = document.getElementById("rateIpca3");
  const ratePreEl = document.getElementById("ratePre");
  const resetRatesBtn = document.getElementById("resetRatesBtn");
  const initialAmountEl = document.getElementById("initialAmount");

  const dpView = {
    startYear: DATA.length ? parseInt(DATA[0].m.slice(0, 4), 10) : 2000,
    endYear: DATA.length ? parseInt(DATA[DATA.length - 1].m.slice(0, 4), 10) : 2026,
  };

  function getMinMaxYears() {
    if (!DATA.length) return { minY: 2000, maxY: 2026 };
    return {
      minY: parseInt(DATA[0].m.slice(0, 4), 10),
      maxY: parseInt(DATA[DATA.length - 1].m.slice(0, 4), 10),
    };
  }

  function updateDateTriggerLabel() {
    if (!DATA.length) return;
    const startLabel = formatMonthLabel(DATA[state.startIdx].m);
    const endLabel = formatMonthLabel(DATA[state.endIdx].m);
    dateTriggerTextEl.textContent = `${startLabel} – ${endLabel}`;
    const count = state.endIdx - state.startIdx + 1;
    dpSummaryEl.textContent = `${count} ${count === 1 ? "mês selecionado" : "meses selecionados"}`;
  }

  function renderDatePopoverGrid(side) {
    const isStart = side === "start";
    const year = isStart ? dpView.startYear : dpView.endYear;
    const yearEl = isStart ? dpStartYearEl : dpEndYearEl;
    const gridEl = isStart ? dpStartMonthsEl : dpEndMonthsEl;
    const { minY, maxY } = getMinMaxYears();

    yearEl.textContent = year;

    const prevBtn = datePopoverEl.querySelector(`.dp-nav-btn[data-side="${side}"][data-dir="-1"]`);
    const nextBtn = datePopoverEl.querySelector(`.dp-nav-btn[data-side="${side}"][data-dir="1"]`);
    if (prevBtn) prevBtn.disabled = year <= minY;
    if (nextBtn) nextBtn.disabled = year >= maxY;

    const ymIndexMap = new Map(DATA.map((r, i) => [r.m, i]));
    gridEl.innerHTML = "";

    MONTH_NAMES.forEach((mName, mIdx) => {
      const ym = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
      const idx = ymIndexMap.get(ym);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dp-month-btn";
      btn.textContent = mName;

      if (idx === undefined) {
        btn.disabled = true;
      } else {
        if ((isStart && idx === state.startIdx) || (!isStart && idx === state.endIdx)) {
          btn.classList.add("selected");
        } else if (idx >= state.startIdx && idx <= state.endIdx) {
          btn.classList.add("in-range");
        }

        btn.addEventListener("click", () => {
          if (isStart) {
            state.startIdx = idx;
            if (state.startIdx > state.endIdx) state.endIdx = state.startIdx;
          } else {
            state.endIdx = idx;
            if (state.endIdx < state.startIdx) state.startIdx = state.endIdx;
          }
          clearPeriodButtons();
          updateDateTriggerLabel();
          renderDatePopover();
          render();
        });
      }

      gridEl.appendChild(btn);
    });
  }

  function renderDatePopover() {
    renderDatePopoverGrid("start");
    renderDatePopoverGrid("end");
  }

  function syncPopoverYearsToSelection() {
    if (!DATA.length) return;
    dpView.startYear = parseInt(DATA[state.startIdx].m.slice(0, 4), 10);
    dpView.endYear = parseInt(DATA[state.endIdx].m.slice(0, 4), 10);
  }

  function populateDateSelectors(keepEndAtLatest = false) {
    const prevStartYm = DATA[state.startIdx]?.m;
    const prevEndYm = DATA[state.endIdx]?.m;
    const wasAtEnd = state.endIdx >= DATA.length - 1;

    if (keepEndAtLatest || wasAtEnd) {
      const activePeriodBtn = document.querySelector("#periodSelector .seg-btn.active");
      if (activePeriodBtn) {
        const months = parseInt(activePeriodBtn.dataset.months, 10);
        state.endIdx = DATA.length - 1;
        state.startIdx = Math.max(0, DATA.length - months);
      } else {
        state.endIdx = DATA.length - 1;
        const foundStart = DATA.findIndex((r) => r.m === prevStartYm);
        state.startIdx = foundStart >= 0 ? foundStart : 0;
      }
    } else {
      const foundStart = DATA.findIndex((r) => r.m === prevStartYm);
      const foundEnd = DATA.findIndex((r) => r.m === prevEndYm);
      state.startIdx = foundStart >= 0 ? foundStart : 0;
      state.endIdx = foundEnd >= 0 ? foundEnd : DATA.length - 1;
    }

    syncPopoverYearsToSelection();
    updateDateTriggerLabel();
    renderDatePopover();
    updateHeaderSubtitle();
  }

  function updateHeaderSubtitle() {
    if (!DATA.length) return;
    const first = formatMonthLabel(DATA[0].m);
    const last = formatMonthLabel(DATA[DATA.length - 1].m);
    headerSubtitleEl.innerHTML = `Série histórica mensal de <strong>CDI</strong>, <strong>IPCA+</strong> e <strong>Prefixado</strong> (${first} – ${last} • ${DATA.length} meses)`;
  }

  function closeDatePopover() {
    datePopoverEl.classList.remove("open");
    dateTriggerEl.setAttribute("aria-expanded", "false");
  }

  function initSelectors() {
    populateDateSelectors(true);

    dateTriggerEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = datePopoverEl.classList.contains("open");
      if (isOpen) {
        closeDatePopover();
      } else {
        syncPopoverYearsToSelection();
        renderDatePopover();
        datePopoverEl.classList.add("open");
        dateTriggerEl.setAttribute("aria-expanded", "true");
      }
    });

    datePopoverEl.querySelectorAll(".dp-nav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const side = btn.dataset.side;
        const dir = parseInt(btn.dataset.dir, 10);
        const { minY, maxY } = getMinMaxYears();
        if (side === "start") {
          dpView.startYear = Math.min(maxY, Math.max(minY, dpView.startYear + dir));
        } else {
          dpView.endYear = Math.min(maxY, Math.max(minY, dpView.endYear + dir));
        }
        renderDatePopover();
      });
    });

    dpDoneBtn.addEventListener("click", () => closeDatePopover());

    document.addEventListener("click", (e) => {
      if (!datePickerEl.contains(e.target)) {
        closeDatePopover();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDatePopover();
    });

    document.querySelectorAll("#metricSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#metricSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.metric = btn.dataset.metric;
        render();
      });
    });

    document.querySelectorAll("#periodSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#periodSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const months = parseInt(btn.dataset.months, 10);
        state.endIdx = DATA.length - 1;
        state.startIdx = Math.max(0, DATA.length - months);
        syncPopoverYearsToSelection();
        updateDateTriggerLabel();
        renderDatePopover();
        render();
      });
    });

    themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const isDark = root.getAttribute("data-theme") === "dark";
      const next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      themeLabel.textContent = next === "dark" ? "Modo Claro" : "Modo Escuro";
      renderChart();
    });

    refreshBtn.addEventListener("click", () => syncFromBCB());
    exportPdfBtn.addEventListener("click", () => window.print());
    downloadMainPngBtn.addEventListener("click", () => {
      window.exportChartAsPng(
        "mainChart",
        chartTitleEl.textContent,
        chartSubtitleEl.textContent,
        "comparativo-renda-fixa.png"
      );
    });
  }

  window.exportChartAsPng = function exportChartAsPng(canvasId, title, subtitle, filename) {
    const src = document.getElementById(canvasId);
    if (!src) return;
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bg = isDark ? "#111927" : "#ffffff";
    const titleColor = isDark ? "#f1f5f9" : "#0a2540";
    const subColor = isDark ? "#8b9bb4" : "#697386";

    const padX = 28;
    const headerH = 66;
    const padBottom = 20;
    const out = document.createElement("canvas");
    out.width = src.width + padX * 2;
    out.height = src.height + headerH + padBottom;

    const ctx = out.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = titleColor;
    ctx.font = "600 17px Inter, -apple-system, sans-serif";
    ctx.fillText(title, padX / dpr, 28);
    ctx.fillStyle = subColor;
    ctx.font = "400 13px Inter, -apple-system, sans-serif";
    ctx.fillText(subtitle, padX / dpr, 48);
    ctx.restore();

    ctx.drawImage(src, padX, headerH);

    const link = document.createElement("a");
    link.download = filename;
    link.href = out.toDataURL("image/png", 1.0);
    link.click();
  };

  function initRateInputs() {
    const syncInputsFromState = () => {
      rateIpca1El.value = rates.ipca1;
      rateIpca2El.value = rates.ipca2;
      rateIpca3El.value = rates.ipca3;
      ratePreEl.value = rates.pre;
    };
    syncInputsFromState();

    const bindInput = (el, key) => {
      el.addEventListener("input", () => {
        const parsed = parseFloat(el.value);
        if (!Number.isFinite(parsed) || parsed <= -100) return;
        rates[key] = parsed;
        saveRates(rates);
        rebuildFullIndex();
        initSeriesPills();
        renderAnnualTable();
        render();
      });
    };

    bindInput(rateIpca1El, "ipca1");
    bindInput(rateIpca2El, "ipca2");
    bindInput(rateIpca3El, "ipca3");
    bindInput(ratePreEl, "pre");

    resetRatesBtn.addEventListener("click", () => {
      Object.assign(rates, DEFAULT_RATES);
      saveRates(rates);
      syncInputsFromState();
      rebuildFullIndex();
      initSeriesPills();
      renderAnnualTable();
      render();
    });

    initialAmountEl.value = state.initialAmount;
    initialAmountEl.addEventListener("input", () => {
      const parsed = parseFloat(initialAmountEl.value);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      state.initialAmount = parsed;
      try {
        localStorage.setItem(AMOUNT_STORAGE_KEY, String(parsed));
      } catch (_) {}
      render();
    });
  }

  function clearPeriodButtons() {
    document.querySelectorAll("#periodSelector .seg-btn").forEach((b) => b.classList.remove("active"));
  }

  function initSeriesPills() {
    seriesPillsEl.innerHTML = "";
    SERIES_CONFIG.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `series-pill ${s.visible ? "active" : ""}`;
      btn.style.setProperty("--pill-color", s.color);
      btn.innerHTML = `<span class="pill-dot"></span><span>${s.label}</span>`;
      btn.addEventListener("click", () => {
        s.visible = !s.visible;
        btn.classList.toggle("active", s.visible);
        render();
      });
      seriesPillsEl.appendChild(btn);
    });
  }

  function computeSliceMetrics() {
    const sIdx = state.startIdx;
    const eIdx = state.endIdx;
    const monthsCount = eIdx - sIdx + 1;
    const yearsCount = monthsCount / 12;

    const ipcaBase = fullIndex["ipca"][sIdx];
    const ipcaEnd = fullIndex["ipca"][eIdx + 1];
    const ipcaFactor = ipcaEnd / ipcaBase;

    const results = SERIES_CONFIG.map((s) => {
      const base = fullIndex[s.id][sIdx];
      const end = fullIndex[s.id][eIdx + 1];
      const factor = end / base;
      const cumPct = (factor - 1) * 100;
      const cagr = (Math.pow(factor, 1 / yearsCount) - 1) * 100;
      const realFactor = factor / ipcaFactor;
      const realPct = (realFactor - 1) * 100;
      const realCagr = (Math.pow(realFactor, 1 / yearsCount) - 1) * 100;
      const finalAmount = state.initialAmount * factor;

      return {
        ...s,
        label: s.label,
        factor,
        cumPct,
        cagr,
        realPct,
        realCagr,
        finalAmount,
      };
    });

    return { monthsCount, yearsCount, results };
  }

  function renderKPIs() {
    const { monthsCount, results } = computeSliceMetrics();
    const mainActive = results.filter((r) => r.visible && !r.isBenchmark);
    const bestFactor = mainActive.length
      ? Math.max(...mainActive.map((r) => r.factor))
      : null;

    kpiGridEl.innerHTML = "";
    results
      .filter((r) => r.visible)
      .forEach((r) => {
        const isLeader = !r.isBenchmark && bestFactor !== null && Math.abs(r.factor - bestFactor) < 1e-9;
        let mainValue = "";
        if (state.metric === "brl") {
          mainValue = formatBRL(r.finalAmount);
        } else if (state.metric === "real") {
          mainValue = `${r.realPct >= 0 ? "+" : ""}${formatPct(r.realPct)}`;
        } else {
          mainValue = `${r.cumPct >= 0 ? "+" : ""}${formatPct(r.cumPct)}`;
        }

        const card = document.createElement("div");
        card.className = "kpi-card";
        card.style.setProperty("--kpi-color", r.color);
        card.innerHTML = `
          <div class="kpi-top">
            <span class="kpi-name">${r.label}</span>
            ${isLeader ? '<span class="kpi-leader">Líder</span>' : ""}
          </div>
          <div class="kpi-main">${mainValue}</div>
          <div class="kpi-sub">
            <span>CAGR: <strong>${formatPct(r.cagr)} a.a.</strong> (${monthsCount}m)</span>
            <span>Real (IPCA): <strong>${r.realCagr >= 0 ? "+" : ""}${formatPct(r.realCagr)} a.a.</strong></span>
            <span>${formatBRL(state.initialAmount)} → <strong>${formatBRL(r.finalAmount)}</strong></span>
          </div>
        `;
        kpiGridEl.appendChild(card);
      });
  }

  function buildChartData() {
    const sIdx = state.startIdx;
    const eIdx = state.endIdx;
    const labels = [];

    if (state.metric === "rolling12") {
      for (let i = sIdx; i <= eIdx; i++) {
        labels.push(formatMonthLabel(DATA[i].m));
      }
    } else {
      labels.push("Início");
      for (let i = sIdx; i <= eIdx; i++) {
        labels.push(formatMonthLabel(DATA[i].m));
      }
    }

    const datasets = SERIES_CONFIG.filter((s) => s.visible).map((s) => {
      const idxArr = fullIndex[s.id];
      const ipcaArr = fullIndex["ipca"];
      const points = [];

      if (state.metric === "rolling12") {
        for (let i = sIdx; i <= eIdx; i++) {
          if (i < 11) {
            points.push(null);
          } else {
            const ret12 = (idxArr[i + 1] / idxArr[i + 1 - 12] - 1) * 100;
            points.push(Number(ret12.toFixed(4)));
          }
        }
      } else {
        const base = idxArr[sIdx];
        const ipcaBase = ipcaArr[sIdx];
        for (let i = sIdx; i <= eIdx + 1; i++) {
          const factor = idxArr[i] / base;
          if (state.metric === "brl") {
            points.push(Number((state.initialAmount * factor).toFixed(2)));
          } else if (state.metric === "real") {
            const realFactor = factor / (ipcaArr[i] / ipcaBase);
            points.push(Number(((realFactor - 1) * 100).toFixed(2)));
          } else {
            points.push(Number(((factor - 1) * 100).toFixed(2)));
          }
        }
      }

      return {
        label: s.label,
        data: points,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: s.isBenchmark ? 2 : 2.5,
        borderDash: s.dashed ? [6, 4] : [],
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.15,
        spanGaps: false,
      };
    });

    return { labels, datasets };
  }

  function renderChart() {
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--text-muted").trim();
    const gridColor = styles.getPropertyValue("--grid").trim();

    const titles = {
      pct: "Rentabilidade Acumulada (%)",
      brl: `Evolução de ${formatBRL(state.initialAmount)}`,
      real: "Ganho Real Acumulado (acima do IPCA %)",
      rolling12: "Rentabilidade Móvel em 12 Meses (% a.a.)",
    };
    chartTitleEl.textContent = titles[state.metric];
    chartSubtitleEl.textContent = `${formatMonthLabel(DATA[state.startIdx].m)} até ${formatMonthLabel(
      DATA[state.endIdx].m
    )} (${state.endIdx - state.startIdx + 1} meses)`;

    const { labels, datasets } = buildChartData();
    const ctx = document.getElementById("mainChart").getContext("2d");

    if (state.chart) {
      state.chart.destroy();
    }

    const topLeftLegendPlugin = {
      id: "topLeftLegend",
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;

        const items = chart.data.datasets
          .map((ds) => {
            const vals = ds.data.filter((v) => v !== null && v !== undefined);
            const lastVal = vals.length ? vals[vals.length - 1] : null;
            return { label: ds.label, color: ds.borderColor, lastVal };
          })
          .sort((a, b) => (b.lastVal ?? -Infinity) - (a.lastVal ?? -Infinity));

        if (!items.length) return;

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const boxBg = isDark ? "rgba(17, 25, 39, 0.92)" : "rgba(255, 255, 255, 0.94)";
        const boxBorder = isDark ? "#232f45" : "#e3e8ee";
        const textMain = isDark ? "#f1f5f9" : "#0a2540";
        const textSub = isDark ? "#8b9bb4" : "#697386";

        ctx.save();
        ctx.font = "600 11.5px Inter, -apple-system, sans-serif";
        const lineH = 20;
        const padX = 12;
        const padY = 10;
        const headerH = 18;

        const formatted = items.map((it) => {
          let vStr = "—";
          if (it.lastVal !== null) {
            vStr =
              state.metric === "brl"
                ? formatBRL(it.lastVal)
                : `${it.lastVal >= 0 ? "+" : ""}${formatPct(it.lastVal)}`;
          }
          return { ...it, vStr, text: `${it.label}: ${vStr}` };
        });

        let maxW = ctx.measureText("Fechamento do período").width;
        for (const f of formatted) {
          const w = 16 + ctx.measureText(f.text).width;
          if (w > maxW) maxW = w;
        }

        const boxW = maxW + padX * 2;
        const boxH = padY * 2 + headerH + formatted.length * lineH - 4;
        const x = chartArea.left + 14;
        const y = chartArea.top + 12;

        // Rounded card
        ctx.fillStyle = boxBg;
        ctx.strokeStyle = boxBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 8);
        ctx.fill();
        ctx.stroke();

        // Header
        ctx.fillStyle = textSub;
        ctx.font = "600 10.5px Inter, -apple-system, sans-serif";
        ctx.fillText(
          `${formatMonthLabel(DATA[state.endIdx].m)} • Acumulado`,
          x + padX,
          y + padY + 9
        );

        // Rows
        formatted.forEach((f, idx) => {
          const ry = y + padY + headerH + idx * lineH;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.roundRect(x + padX, ry + 2, 10, 10, 2);
          ctx.fill();

          ctx.fillStyle = textMain;
          ctx.font = "600 11.5px Inter, -apple-system, sans-serif";
          ctx.fillText(f.text, x + padX + 16, ry + 11);
        });

        ctx.restore();
      },
    };

    state.chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      plugins: [topLeftLegendPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "#0a2540",
            titleColor: "#ffffff",
            bodyColor: "#e2e8f0",
            borderColor: "#1e3a5f",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            itemSort: (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity),
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                if (v === null || v === undefined) return `${ctx.dataset.label}: —`;
                if (state.metric === "brl") {
                  return ` ${ctx.dataset.label}: ${formatBRL(v)}`;
                }
                return ` ${ctx.dataset.label}: ${v >= 0 ? "+" : ""}${formatPct(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              maxTicksLimit: 12,
              font: { size: 11 },
            },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: "JetBrains Mono, monospace", size: 11 },
              callback: (val) => {
                if (state.metric === "brl") {
                  return "R$ " + Number(val).toLocaleString("pt-BR");
                }
                return Number(val).toLocaleString("pt-BR") + "%";
              },
            },
          },
        },
      },
    });
  }

  function renderAnnualTable() {
    const table = document.getElementById("annualTable");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    const yearsMap = new Map();
    DATA.forEach((row) => {
      const y = row.m.slice(0, 4);
      if (!yearsMap.has(y)) yearsMap.set(y, []);
      yearsMap.get(y).push(row);
    });

    thead.innerHTML = `
      <tr>
        <th>Ano</th>
        ${SERIES_CONFIG.map((s) => `<th>${s.label}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = "";
    for (const [year, rows] of yearsMap.entries()) {
      const returns = SERIES_CONFIG.map((s) => {
        let f = 1.0;
        for (const r of rows) {
          f *= s.monthlyFactor(r);
        }
        return { id: s.id, isBenchmark: s.isBenchmark, pct: (f - 1) * 100 };
      });

      const bestMain = Math.max(
        ...returns.filter((r) => !r.isBenchmark).map((r) => r.pct)
      );

      const yearLabel =
        rows.length < 12 ? `${year}* (${rows.length}m)` : year;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${yearLabel}</td>
        ${returns
          .map((r) => {
            const isBest = !r.isBenchmark && Math.abs(r.pct - bestMain) < 1e-9;
            return `<td class="${isBest ? "best-cell" : ""}">${formatPct(r.pct)}</td>`;
          })
          .join("")}
      `;
      tbody.appendChild(tr);
    }
  }

  function setSyncStatus(mode, text) {
    syncStatusEl.className = `sync-status ${mode}`;
    syncTextEl.textContent = text;
  }

  async function syncFromBCB() {
    setSyncStatus("loading", "Sincronizando com BCB...");
    refreshBtn.disabled = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const urlIpca = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/20?formato=json";
      const urlCdi = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados/ultimos/20?formato=json";

      const [resIpca, resCdi] = await Promise.all([
        fetch(urlIpca, { signal: controller.signal }),
        fetch(urlCdi, { signal: controller.signal }),
      ]);

      if (!resIpca.ok || !resCdi.ok) {
        throw new Error(`HTTP ${resIpca.status}/${resCdi.status}`);
      }

      const [ipcaJson, cdiJson] = await Promise.all([resIpca.json(), resCdi.json()]);
      const ipcaMap = new Map();
      const cdiMap = new Map();

      for (const item of ipcaJson) {
        const ym = `${item.data.slice(6, 10)}-${item.data.slice(3, 5)}`;
        ipcaMap.set(ym, parseFloat(item.valor));
      }
      for (const item of cdiJson) {
        const ym = `${item.data.slice(6, 10)}-${item.data.slice(3, 5)}`;
        cdiMap.set(ym, parseFloat(item.valor));
      }

      const existingMap = new Map(DATA.map((r) => [r.m, r]));
      let addedCount = 0;

      for (const [ym, ipcaVal] of ipcaMap.entries()) {
        if (!cdiMap.has(ym)) continue; // Only closed months with both IPCA and CDI
        const cdiVal = cdiMap.get(ym);
        if (!Number.isFinite(ipcaVal) || !Number.isFinite(cdiVal)) continue;

        if (!existingMap.has(ym)) addedCount++;
        existingMap.set(ym, { m: ym, ipca: ipcaVal, cdi: cdiVal });
      }

      DATA = Array.from(existingMap.values()).sort((a, b) => a.m.localeCompare(b.m));

      rebuildFullIndex();
      populateDateSelectors(addedCount > 0);
      renderAnnualTable();
      render();

      const latestLabel = DATA.length ? formatMonthLabel(DATA[DATA.length - 1].m) : "—";
      const suffix = addedCount > 0 ? ` (+${addedCount} novo${addedCount > 1 ? "s" : ""})` : "";
      setSyncStatus("live", `BCB ao vivo até ${latestLabel}${suffix}`);
    } catch (_) {
      const latestLabel = DATA.length ? formatMonthLabel(DATA[DATA.length - 1].m) : "—";
      setSyncStatus("offline", `Base local até ${latestLabel} (offline)`);
    } finally {
      clearTimeout(timer);
      refreshBtn.disabled = false;
    }
  }

  function render() {
    renderKPIs();
    renderChart();
  }

  initRateInputs();
  initSelectors();
  initSeriesPills();
  renderAnnualTable();
  render();
  syncFromBCB();
})();
