(() => {
  const DEFAULTS = {
    mode: "invest", // invest | goal
    bondType: "ipca", // ipca | pre | selic
    bondRate: 7.0,
    custody: 0.2,
    expIpca: 4.5,
    expSelic: 14.25,
    cdbPct: 100,
    lciPct: 90,
    fundPct: 98,
    fundFee: 0.5,
    initial: 10000,
    monthly: 500,
    targetNet: 100000,
    goalMonthly: 0,
  };

  const simState = { ...DEFAULTS, chart: null };

  function getIrByDays(days) {
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.20;
    if (days <= 720) return 0.175;
    return 0.15;
  }

  function formatBRL(val) {
    return val.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPct(val, decimals = 2) {
    return (
      val.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + "%"
    );
  }

  function formatDateBR(date) {
    return date.toLocaleDateString("pt-BR");
  }

  function toInputDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // DOM refs
  const startDateEl = document.getElementById("simStartDate");
  const endDateEl = document.getElementById("simEndDate");
  const investInputsEl = document.getElementById("simInvestInputs");
  const goalInputsEl = document.getElementById("simGoalInputs");
  const initialEl = document.getElementById("simInitial");
  const monthlyEl = document.getElementById("simMonthly");
  const targetNetEl = document.getElementById("simTargetNet");
  const goalMonthlyEl = document.getElementById("simGoalMonthly");
  const bondTypeEl = document.getElementById("simBondType");
  const bondRateEl = document.getElementById("simBondRate");
  const bondRateLabelEl = document.getElementById("simBondRateLabel");
  const custodyEl = document.getElementById("simCustody");
  const expIpcaEl = document.getElementById("simExpIpca");
  const expSelicEl = document.getElementById("simExpSelic");
  const cdbPctEl = document.getElementById("simCdbPct");
  const lciPctEl = document.getElementById("simLciPct");
  const fundPctEl = document.getElementById("simFundPct");
  const fundFeeEl = document.getElementById("simFundFee");
  const resetBtn = document.getElementById("simResetBtn");
  const kpiGridEl = document.getElementById("simKpiGrid");
  const chartSubEl = document.getElementById("simChartSub");
  const tableSubEl = document.getElementById("simTableSub");

  function getDates() {
    const s = new Date(startDateEl.value + "T00:00:00");
    const e = new Date(endDateEl.value + "T00:00:00");
    const validS = Number.isNaN(s.getTime()) ? new Date() : s;
    const validE = Number.isNaN(e.getTime()) || e <= validS ? new Date(validS.getTime() + 86400000 * 365) : e;
    const totalDays = Math.max(1, Math.round((validE - validS) / 86400000));
    return { startDate: validS, endDate: validE, totalDays };
  }

  function getBondAnnualGross() {
    const ipca = simState.expIpca / 100;
    const selic = simState.expSelic / 100;
    const r = simState.bondRate / 100;
    if (simState.bondType === "ipca" || simState.bondType === "educa" || simState.bondType === "renda") {
      return (1 + ipca) * (1 + r) - 1;
    }
    if (simState.bondType === "pre") return r;
    return selic + r; // Tesouro Selic + spread
  }

  function getBondTitle() {
    const rStr = Number(simState.bondRate).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    if (simState.bondType === "ipca") return `Tesouro IPCA+ ${rStr}%`;
    if (simState.bondType === "educa") return `Tesouro Educa+ ${rStr}%`;
    if (simState.bondType === "renda") return `Tesouro Renda+ ${rStr}%`;
    if (simState.bondType === "pre") return `Tesouro Prefixado ${rStr}%`;
    return `Tesouro Selic + ${rStr}%`;
  }

  function getPoupancaAnnual() {
    const selic = simState.expSelic / 100;
    return selic > 0.085 ? Math.pow(1.005, 12) - 1 : 0.7 * selic;
  }

  function simulateInstrument(totalDays, initial, monthly, annualGross, annualFee, isExempt, selicExemption = false) {
    const monthsCount = Math.floor(totalDays / 30.4375);
    const tranches = [{ amount: initial, days: totalDays }];
    for (let m = 1; m <= monthsCount; m++) {
      const remDays = Math.max(1, Math.round(totalDays - m * 30.4375));
      if (monthly > 0) tranches.push({ amount: monthly, days: remDays });
    }

    let totalInvested = 0;
    let totalGross = 0;
    let totalAfterFeeFull = 0;
    let totalIrFull = 0;
    let totalIrNoFee = 0;

    for (const tr of tranches) {
      totalInvested += tr.amount;
      const gross = tr.amount * Math.pow(1 + annualGross, tr.days / 365);
      const netRateBeforeIr = Math.max(-0.99, (1 + annualGross) / (1 + annualFee) - 1);
      const afterFee = tr.amount * Math.pow(1 + netRateBeforeIr, tr.days / 365);
      const irRate = isExempt ? 0 : getIrByDays(tr.days);

      const irFull = Math.max(0, afterFee - tr.amount) * irRate;
      const irNoFee = Math.max(0, gross - tr.amount) * irRate;

      totalGross += gross;
      totalAfterFeeFull += afterFee;
      totalIrFull += irFull;
      totalIrNoFee += irNoFee;
    }

    let totalNet = totalAfterFeeFull - totalIrFull;
    if (selicExemption && annualFee > 0) {
      // B3 rule: Tesouro Selic has 0% custody up to R$ 10,000; 0.20% p.a. only on excess
      const excessRatio = totalGross > 10000 ? (totalGross - 10000) / totalGross : 0;
      const netNoFee = totalGross - totalIrNoFee;
      const netWithFullFee = totalAfterFeeFull - totalIrFull;
      totalNet = netNoFee - (netNoFee - netWithFullFee) * excessRatio;
    }

    const totalCost = Math.max(0, totalGross - totalNet);
    const netReturnPct = totalInvested > 0 ? ((totalNet - totalInvested) / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalGross,
      totalCost,
      totalNet,
      netReturnPct,
    };
  }

  function buildTimeline(totalDays, initial, monthly, annualGross, annualFee, isExempt, selicExemption = false) {
    const steps = Math.max(1, Math.min(240, Math.round(totalDays / 30.4375)));
    const points = [];
    for (let s = 0; s <= steps; s++) {
      const elapsedDays = s === steps ? totalDays : Math.round((s / steps) * totalDays);
      if (elapsedDays === 0) {
        points.push({ day: 0, invested: initial, net: initial });
        continue;
      }
      const res = simulateInstrument(elapsedDays, initial, monthly, annualGross, annualFee, isExempt, selicExemption);
      points.push({ day: elapsedDays, invested: res.totalInvested, net: res.totalNet });
    }
    return points;
  }

  function renderSimulator() {
    const { startDate, endDate, totalDays } = getDates();
    const bondGross = getBondAnnualGross();
    const bondFee = simState.custody / 100;
    const cdi = simState.expSelic / 100;

    let effInitial = simState.initial;
    let effMonthly = simState.monthly;

    const isSelic = simState.bondType === "selic";

    if (simState.mode === "goal") {
      effMonthly = simState.goalMonthly;
      const fromMonthly = simulateInstrument(totalDays, 0, effMonthly, bondGross, bondFee, false, isSelic).totalNet;
      const unitInitial = simulateInstrument(totalDays, 1, 0, bondGross, bondFee, false, isSelic).totalNet;
      effInitial = Math.max(0, (simState.targetNet - fromMonthly) / unitInitial);
    }

    const instruments = [
      {
        name: getBondTitle(),
        color: "#635bff",
        gross: bondGross,
        fee: bondFee,
        exempt: false,
        selicExemption: isSelic,
        isMain: true,
      },
      {
        name: `CDB (${simState.cdbPct}% CDI)`,
        color: "#0284c7",
        gross: cdi * (simState.cdbPct / 100),
        fee: 0,
        exempt: false,
      },
      {
        name: `LCI/LCA (${simState.lciPct}% CDI)`,
        color: "#09825d",
        gross: cdi * (simState.lciPct / 100),
        fee: 0,
        exempt: true,
      },
      {
        name: `Fundo DI (${simState.fundPct}% CDI)`,
        color: "#d97706",
        gross: cdi * (simState.fundPct / 100),
        fee: simState.fundFee / 100,
        exempt: false,
      },
      {
        name: "Poupança",
        color: "#94a3b8",
        gross: getPoupancaAnnual(),
        fee: 0,
        exempt: true,
      },
    ];

    const results = instruments.map((inst) => ({
      ...inst,
      ...simulateInstrument(totalDays, effInitial, effMonthly, inst.gross, inst.fee, inst.exempt, Boolean(inst.selicExemption)),
    }));

    const mainRes = results[0];
    const irMain = getIrByDays(totalDays);
    const yearsStr = (totalDays / 365).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

    // KPIs
    kpiGridEl.innerHTML = "";
    const kpiItems =
      simState.mode === "goal"
        ? [
            {
              title: "Aporte Inicial Necessário",
              color: "#635bff",
              main: formatBRL(effInitial),
              sub: `Para atingir ${formatBRL(simState.targetNet)} líquidos em ${formatDateBR(endDate)}`,
              badge: "Meta",
            },
            {
              title: "Total Investido",
              color: "#0284c7",
              main: formatBRL(mainRes.totalInvested),
              sub: `Inicial + aportes mensais de ${formatBRL(effMonthly)}`,
            },
            {
              title: "Rendimento Bruto",
              color: "#09825d",
              main: formatBRL(mainRes.totalGross - mainRes.totalInvested),
              sub: `Valor bruto: ${formatBRL(mainRes.totalGross)}`,
            },
            {
              title: "IR + Taxa B3 Estimados",
              color: "#d97706",
              main: formatBRL(mainRes.totalCost),
              sub: `Alíquota base: ${formatPct(irMain * 100, 1)} (${totalDays} dias)`,
            },
          ]
        : [
            {
              title: `Líquido (${getBondTitle()})`,
              color: "#635bff",
              main: formatBRL(mainRes.totalNet),
              sub: `Rentabilidade líquida: +${formatPct(mainRes.netReturnPct)}`,
              badge: `${yearsStr} anos`,
            },
            {
              title: "Total Investido",
              color: "#0284c7",
              main: formatBRL(mainRes.totalInvested),
              sub: `Inicial ${formatBRL(effInitial)} + ${formatBRL(effMonthly)}/mês`,
            },
            {
              title: "Valor Bruto no Resgate",
              color: "#09825d",
              main: formatBRL(mainRes.totalGross),
              sub: `Ganho bruto: ${formatBRL(mainRes.totalGross - mainRes.totalInvested)}`,
            },
            {
              title: "IR + Taxa B3 Estimados",
              color: "#d97706",
              main: formatBRL(mainRes.totalCost),
              sub: `IR ${formatPct(irMain * 100, 1)} sobre lucro (${totalDays}d)`,
            },
          ];

    kpiItems.forEach((k) => {
      const card = document.createElement("div");
      card.className = "kpi-card";
      card.style.setProperty("--kpi-color", k.color);
      card.innerHTML = `
        <div class="kpi-top">
          <span class="kpi-name">${k.title}</span>
          ${k.badge ? `<span class="kpi-leader">${k.badge}</span>` : ""}
        </div>
        <div class="kpi-main">${k.main}</div>
        <div class="kpi-sub"><span>${k.sub}</span></div>
      `;
      kpiGridEl.appendChild(card);
    });

    // Chart
    chartSubEl.textContent = `${formatDateBR(startDate)} até ${formatDateBR(endDate)} (${totalDays} dias corridos • ${yearsStr} anos)`;
    tableSubEl.textContent = `Comparação líquida na data de resgate ${formatDateBR(endDate)} (${totalDays} dias)`;

    const timelines = instruments.map((inst) => ({
      ...inst,
      points: buildTimeline(totalDays, effInitial, effMonthly, inst.gross, inst.fee, inst.exempt, Boolean(inst.selicExemption)),
    }));

    const labels = timelines[0].points.map((p) => {
      const d = new Date(startDate.getTime() + p.day * 86400000);
      return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    });

    const datasets = [
      ...timelines.map((tl) => ({
        label: tl.name,
        data: tl.points.map((p) => Number(p.net.toFixed(2))),
        borderColor: tl.color,
        backgroundColor: tl.color,
        borderWidth: tl.isMain ? 2.8 : 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.15,
      })),
      {
        label: "Total Investido",
        data: timelines[0].points.map((p) => Number(p.invested.toFixed(2))),
        borderColor: "#64748b",
        borderDash: [5, 4],
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0,
      },
    ];

    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--text-muted").trim();
    const gridColor = styles.getPropertyValue("--grid").trim();

    const ctx = document.getElementById("simChart").getContext("2d");
    if (simState.chart) simState.chart.destroy();

    simState.chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: textColor,
              usePointStyle: true,
              boxWidth: 8,
              font: { size: 12 },
            },
          },
          tooltip: {
            backgroundColor: "#0a2540",
            titleColor: "#ffffff",
            bodyColor: "#e2e8f0",
            padding: 12,
            cornerRadius: 8,
            itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatBRL(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, maxTicksLimit: 10, font: { size: 11 } },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: "JetBrains Mono, monospace", size: 11 },
              callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR"),
            },
          },
        },
      },
    });

    // Table sorted by net value
    const sorted = [...results].sort((a, b) => b.totalNet - a.totalNet);
    const bestNet = sorted[0]?.totalNet ?? 0;
    const tbody = document.querySelector("#simTable tbody");
    tbody.innerHTML = sorted
      .map((r, i) => {
        const isBest = i === 0;
        return `
          <tr>
            <td>${r.name}${isBest ? '<span class="winner-badge">Melhor</span>' : ""}</td>
            <td>${formatBRL(r.totalInvested)}</td>
            <td>${formatBRL(r.totalGross)}</td>
            <td>${formatBRL(r.totalCost)}</td>
            <td class="${isBest ? "best-cell" : ""}">${formatBRL(r.totalNet)}</td>
            <td>+${formatPct(r.netReturnPct)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function updateBondRateLabel() {
    if (simState.bondType === "ipca" || simState.bondType === "educa" || simState.bondType === "renda") {
      bondRateLabelEl.textContent = "Taxa Real IPCA+ (% a.a.)";
    } else if (simState.bondType === "pre") {
      bondRateLabelEl.textContent = "Taxa Prefixada (% a.a.)";
    } else {
      bondRateLabelEl.textContent = "Spread Selic+ (% a.a.)";
    }
  }

  function initSimulator() {
    const today = new Date();
    startDateEl.value = toInputDate(today);

    document.querySelectorAll("#simModeSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#simModeSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        simState.mode = btn.dataset.mode;
        investInputsEl.classList.toggle("hidden", simState.mode !== "invest");
        goalInputsEl.classList.toggle("hidden", simState.mode !== "goal");
        renderSimulator();
      });
    });

    bondTypeEl.addEventListener("change", () => {
      simState.bondType = bondTypeEl.value;
      if (simState.bondType === "ipca" || simState.bondType === "educa" || simState.bondType === "renda") {
        simState.bondRate = 7.0;
      } else if (simState.bondType === "pre") {
        simState.bondRate = 13.5;
      } else {
        simState.bondRate = 0.1;
      }
      simState.custody = simState.bondType === "educa" || simState.bondType === "renda" ? 0.0 : 0.2;
      bondRateEl.value = simState.bondRate;
      custodyEl.value = simState.custody;
      updateBondRateLabel();
      renderSimulator();
    });

    const bindNum = (el, key, minVal = -99) => {
      el.addEventListener("input", () => {
        const v = parseFloat(el.value);
        if (!Number.isFinite(v) || v < minVal) return;
        simState[key] = v;
        renderSimulator();
      });
    };

    bindNum(initialEl, "initial", 0);
    bindNum(monthlyEl, "monthly", 0);
    bindNum(targetNetEl, "targetNet", 1);
    bindNum(goalMonthlyEl, "goalMonthly", 0);
    bindNum(bondRateEl, "bondRate", -50);
    bindNum(custodyEl, "custody", 0);
    bindNum(expIpcaEl, "expIpca", -50);
    bindNum(expSelicEl, "expSelic", 0);
    bindNum(cdbPctEl, "cdbPct", 0);
    bindNum(lciPctEl, "lciPct", 0);
    bindNum(fundPctEl, "fundPct", 0);
    bindNum(fundFeeEl, "fundFee", 0);

    startDateEl.addEventListener("change", renderSimulator);
    endDateEl.addEventListener("change", renderSimulator);

    resetBtn.addEventListener("click", () => {
      Object.assign(simState, DEFAULTS);
      startDateEl.value = toInputDate(new Date());
      endDateEl.value = "2031-03-01";
      bondTypeEl.value = simState.bondType;
      bondRateEl.value = simState.bondRate;
      custodyEl.value = simState.custody;
      expIpcaEl.value = simState.expIpca;
      expSelicEl.value = simState.expSelic;
      cdbPctEl.value = simState.cdbPct;
      lciPctEl.value = simState.lciPct;
      fundPctEl.value = simState.fundPct;
      fundFeeEl.value = simState.fundFee;
      initialEl.value = simState.initial;
      monthlyEl.value = simState.monthly;
      targetNetEl.value = simState.targetNet;
      goalMonthlyEl.value = simState.goalMonthly;
      updateBondRateLabel();
      renderSimulator();
    });

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === "simulator") renderSimulator();
      });
    });
    window.addEventListener("tabchanged", (e) => {
      if (e.detail === "simulator") renderSimulator();
    });

    document.getElementById("themeToggle").addEventListener("click", () => {
      setTimeout(() => renderSimulator(), 10);
    });

    const downloadSimPngBtn = document.getElementById("downloadSimPngBtn");
    if (downloadSimPngBtn) {
      downloadSimPngBtn.addEventListener("click", () => {
        if (typeof window.exportChartAsPng === "function") {
          window.exportChartAsPng(
            "simChart",
            document.getElementById("simChartTitle").textContent,
            chartSubEl.textContent,
            "simulacao-resgate.png"
          );
        }
      });
    }

    updateBondRateLabel();
    renderSimulator();
  }

  initSimulator();
})();
