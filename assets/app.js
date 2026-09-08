(() => {
  "use strict";

  const DATA_PATHS = {
    operators: "./data/operators.csv",
    games: "./data/games.csv",
    availability: "./data/availability.csv",
    status: "./data/status.json",
  };

  const TARGET_MARKETS = [
    { region: "LATAM", countries: ["Mexico", "Argentina", "Chile", "Colombia"] },
    {
      region: "WEST AFRICA",
      countries: ["Nigeria", "Ghana", "Senegal", "Côte d’Ivoire", "Togo", "Uganda", "Benin"],
    },
    { region: "INDIA", countries: ["India"] },
  ];

  const TARGET_COUNTRIES = new Set(TARGET_MARKETS.flatMap((group) => group.countries));
  const COUNTRY_REGION = new Map(
    TARGET_MARKETS.flatMap((group) => group.countries.map((country) => [country, group.region])),
  );
  const COLORS = ["#d9ff43", "#74d7ff", "#ff8c72", "#b9a1ff", "#76e7a1", "#f7c85d", "#ff86c8", "#aeb9c7"];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const RU_MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];

  const ui = {};
  const state = {
    data: null,
    selectedBrands: new Set(),
    brandUniverse: [],
    marketMode: "operators",
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindNavigation();
    bindControls();

    try {
      const raw = await loadData();
      state.data = indexData(raw);
      initialiseFilters();
      renderStatus(raw.status);
      renderOverview();
      updateBrandUniverse(false);
      renderMarket();
      renderFooter();
      ui.loadingPanel.hidden = true;
      activateInitialScreen();
    } catch (error) {
      console.error(error);
      ui.loadingPanel.hidden = true;
      ui.appError.hidden = false;
      ui.appError.innerHTML =
        "<strong>Не удалось загрузить dashboard.</strong> Запустите repository через локальный HTTP-сервер и проверьте наличие файлов в <code>/data</code>.";
      ui.headerStatus.textContent = "Ошибка загрузки данных";
      document.querySelector(".status-dot")?.classList.add("status-dot--error");
    }
  }

  function cacheElements() {
    const ids = [
      "loading-panel",
      "app-error",
      "header-status",
      "overview-country",
      "overview-date",
      "overview-context",
      "operators-count",
      "games-count",
      "operators-table",
      "games-table",
      "status-current",
      "status-updated",
      "status-checked",
      "status-reports",
      "brands-country",
      "brands-metric",
      "brands-from",
      "brands-to",
      "brand-picker",
      "brand-picker-count",
      "brand-search",
      "brand-defaults",
      "brand-clear",
      "brand-options",
      "selected-brands",
      "brand-chart-kicker",
      "brand-chart-title",
      "brand-chart-note",
      "brand-chart",
      "brand-legend",
      "market-country",
      "market-from",
      "market-to",
      "market-content",
      "footer-coverage",
    ];
    ids.forEach((id) => {
      ui[toCamel(id)] = document.getElementById(id);
    });
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  async function loadData() {
    const [operatorsText, gamesText, availabilityText, statusResponse] = await Promise.all([
      fetchText(DATA_PATHS.operators),
      fetchText(DATA_PATHS.games),
      fetchText(DATA_PATHS.availability),
      fetch(DATA_PATHS.status, { cache: "no-store" }),
    ]);

    if (!statusResponse.ok) {
      throw new Error(`status.json: HTTP ${statusResponse.status}`);
    }

    return {
      operators: parseCSV(operatorsText)
        .filter((row) => TARGET_COUNTRIES.has(row.country))
        .map((row) => ({
          ...row,
          rank: toNumber(row.rank),
          aps: toNumber(row.aps),
          ceb_usd: toNumber(row.ceb_usd),
          market_share_pct: toNumber(row.market_share_pct),
        })),
      games: parseCSV(gamesText)
        .filter((row) => TARGET_COUNTRIES.has(row.country))
        .map((row) => ({ ...row, rank: toNumber(row.rank) })),
      availability: parseCSV(availabilityText)
        .filter((row) => TARGET_COUNTRIES.has(row.country))
        .map((row) => ({
          ...row,
          operators_available: row.operators_available.toLowerCase() === "true",
          games_available: row.games_available.toLowerCase() === "true",
        })),
      status: await statusResponse.json(),
    };
  }

  async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];

      if (character === '"' && quoted && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(field);
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header));
    return rows.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
  }

  function toNumber(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function indexData(raw) {
    const availabilityByKey = new Map();
    const datesByCountry = new Map();
    const operatorsByKey = new Map();
    const gamesByKey = new Map();

    raw.availability.forEach((record) => {
      availabilityByKey.set(key(record.country, record.report_date), record);
      if (!datesByCountry.has(record.country)) datesByCountry.set(record.country, new Set());
      datesByCountry.get(record.country).add(record.report_date);
    });

    raw.operators.forEach((record) => {
      const snapshotKey = key(record.country, record.report_date);
      if (!operatorsByKey.has(snapshotKey)) operatorsByKey.set(snapshotKey, []);
      operatorsByKey.get(snapshotKey).push(record);
    });

    raw.games.forEach((record) => {
      const snapshotKey = key(record.country, record.report_date);
      if (!gamesByKey.has(snapshotKey)) gamesByKey.set(snapshotKey, []);
      gamesByKey.get(snapshotKey).push(record);
    });

    operatorsByKey.forEach((rows) => rows.sort((a, b) => a.rank - b.rank));
    gamesByKey.forEach((rows) => rows.sort((a, b) => a.rank - b.rank));

    const sortedDatesByCountry = new Map(
      [...datesByCountry.entries()].map(([country, dates]) => [country, [...dates].sort()]),
    );

    return {
      ...raw,
      availabilityByKey,
      datesByCountry: sortedDatesByCountry,
      operatorsByKey,
      gamesByKey,
    };
  }

  function key(country, date) {
    return `${country}\u0000${date}`;
  }

  function bindNavigation() {
    document.querySelectorAll("[data-screen]").forEach((tab) => {
      tab.addEventListener("click", () => showScreen(tab.dataset.screen));
      tab.addEventListener("keydown", (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const tabs = [...document.querySelectorAll("[data-screen]")];
        const current = tabs.indexOf(tab);
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(current + offset + tabs.length) % tabs.length];
        next.focus();
        showScreen(next.dataset.screen);
      });
    });
  }

  function bindControls() {
    ui.overviewCountry.addEventListener("change", () => {
      fillSnapshotDates(ui.overviewDate, ui.overviewCountry.value);
      renderOverview();
    });
    ui.overviewDate.addEventListener("change", renderOverview);

    ui.brandsCountry.addEventListener("change", () => {
      fillRange(ui.brandsFrom, ui.brandsTo, ui.brandsCountry.value);
      updateBrandUniverse(false);
    });
    ui.brandsMetric.addEventListener("change", renderBrandChart);
    ui.brandsFrom.addEventListener("change", () => {
      normaliseRange(ui.brandsFrom, ui.brandsTo, "from");
      updateBrandUniverse(true);
    });
    ui.brandsTo.addEventListener("change", () => {
      normaliseRange(ui.brandsFrom, ui.brandsTo, "to");
      updateBrandUniverse(true);
    });
    ui.brandSearch.addEventListener("input", renderBrandOptions);
    ui.brandDefaults.addEventListener("click", () => {
      selectDefaultBrands();
      renderBrandControls();
      renderBrandChart();
    });
    ui.brandClear.addEventListener("click", () => {
      state.selectedBrands.clear();
      renderBrandControls();
      renderBrandChart();
    });

    ui.marketCountry.addEventListener("change", () => {
      fillRange(ui.marketFrom, ui.marketTo, ui.marketCountry.value);
      renderMarket();
    });
    ui.marketFrom.addEventListener("change", () => {
      normaliseRange(ui.marketFrom, ui.marketTo, "from");
      renderMarket();
    });
    ui.marketTo.addEventListener("change", () => {
      normaliseRange(ui.marketFrom, ui.marketTo, "to");
      renderMarket();
    });
    document.querySelectorAll("[data-market-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.marketMode = button.dataset.marketMode;
        document.querySelectorAll("[data-market-mode]").forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        });
        renderMarket();
      });
    });
  }

  function activateInitialScreen() {
    const requested = window.location.hash.replace("#", "");
    showScreen(["overview", "brands", "market"].includes(requested) ? requested : "overview", false);
  }

  function showScreen(screen, updateHash = true) {
    document.querySelectorAll("[data-screen]").forEach((tab) => {
      const active = tab.dataset.screen === screen;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-screen-panel]").forEach((panel) => {
      const active = panel.dataset.screenPanel === screen;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    if (updateHash) history.replaceState(null, "", `#${screen}`);
  }

  function initialiseFilters() {
    [ui.overviewCountry, ui.brandsCountry, ui.marketCountry].forEach(fillCountries);
    ui.overviewCountry.value = "Mexico";
    ui.brandsCountry.value = "Mexico";
    ui.marketCountry.value = "Mexico";
    fillSnapshotDates(ui.overviewDate, "Mexico");
    fillRange(ui.brandsFrom, ui.brandsTo, "Mexico");
    fillRange(ui.marketFrom, ui.marketTo, "Mexico");
  }

  function fillCountries(select) {
    select.replaceChildren();
    TARGET_MARKETS.forEach((group) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.region;
      group.countries.forEach((country) => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = country;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  function datesFor(country) {
    return state.data?.datesByCountry.get(country) ?? [];
  }

  function fillSnapshotDates(select, country) {
    const dates = datesFor(country);
    select.replaceChildren();
    if (!dates.length) {
      select.add(new Option("Данные отсутствуют", ""));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    dates.forEach((date, index) => {
      const latest = index === dates.length - 1 ? " (latest)" : "";
      select.add(new Option(`${formatDate(date)}${latest}`, date));
    });
    select.value = dates[dates.length - 1];
  }

  function fillRange(fromSelect, toSelect, country) {
    const dates = datesFor(country);
    fromSelect.replaceChildren();
    toSelect.replaceChildren();
    if (!dates.length) {
      fromSelect.add(new Option("Данные отсутствуют", ""));
      toSelect.add(new Option("Данные отсутствуют", ""));
      fromSelect.disabled = true;
      toSelect.disabled = true;
      return;
    }
    fromSelect.disabled = false;
    toSelect.disabled = false;
    dates.forEach((date) => {
      fromSelect.add(new Option(formatDate(date), date));
      toSelect.add(new Option(formatDate(date), date));
    });
    fromSelect.value = dates[0];
    toSelect.value = dates[dates.length - 1];
  }

  function normaliseRange(fromSelect, toSelect, changed) {
    if (!fromSelect.value || !toSelect.value) return;
    if (fromSelect.value <= toSelect.value) return;
    if (changed === "from") toSelect.value = fromSelect.value;
    else fromSelect.value = toSelect.value;
  }

  function selectedDates(country, from, to) {
    return datesFor(country).filter((date) => date >= from && date <= to);
  }

  function availability(country, date) {
    return state.data.availabilityByKey.get(key(country, date));
  }

  function operatorSnapshot(country, date) {
    return state.data.operatorsByKey.get(key(country, date)) ?? [];
  }

  function gameSnapshot(country, date) {
    return state.data.gamesByKey.get(key(country, date)) ?? [];
  }

  function renderOverview() {
    const country = ui.overviewCountry.value;
    const date = ui.overviewDate.value;
    const record = date ? availability(country, date) : null;
    const operators = date ? operatorSnapshot(country, date) : [];
    const games = date ? gameSnapshot(country, date) : [];

    if (!record) {
      ui.overviewContext.innerHTML = `<span><strong>${escapeHTML(COUNTRY_REGION.get(country) ?? "")}</strong> · Данные отсутствуют</span>`;
      ui.operatorsCount.textContent = "—";
      ui.gamesCount.textContent = "—";
      ui.operatorsTable.innerHTML = emptyState();
      ui.gamesTable.innerHTML = emptyState();
      return;
    }

    const tier = operators[0]?.tier ?? games[0]?.tier ?? "";
    const operatorStatus = record.operators_available ? `${operators.length} brands` : "Данные отсутствуют";
    const gameStatus = record.games_available ? `${games.length} games` : "Данные отсутствуют";
    ui.overviewContext.innerHTML = `<span><strong>${escapeHTML(record.region)}</strong>${tier ? ` · ${escapeHTML(tier)}` : ""}<br>${escapeHTML(operatorStatus)} · ${escapeHTML(gameStatus)}</span>`;

    renderOverviewOperators(record, operators);
    renderOverviewGames(record, games);
  }

  function renderOverviewOperators(record, rows) {
    if (!record.operators_available) {
      ui.operatorsCount.textContent = "Данные отсутствуют";
      ui.operatorsTable.innerHTML = emptyState();
      return;
    }
    if (!rows.length) {
      ui.operatorsCount.textContent = "Ошибка данных";
      ui.operatorsTable.innerHTML = mismatchState();
      return;
    }
    ui.operatorsCount.textContent = `${rows.length} / 15`;
    ui.operatorsTable.innerHTML = `
      <table>
        <thead><tr><th>Rank</th><th>Brand</th><th class="numeric">APS</th><th class="numeric">CEB</th><th class="numeric">Market Share</th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td class="rank-cell"><strong>${row.rank}</strong></td>
              <td class="name-cell">${escapeHTML(row.brand)}</td>
              <td class="numeric">${formatInteger(row.aps)}</td>
              <td class="numeric">${formatCurrency(row.ceb_usd)}</td>
              <td class="numeric">${formatShare(row.market_share_pct)}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>`;
  }

  function renderOverviewGames(record, rows) {
    if (!record.games_available) {
      ui.gamesCount.textContent = "Данные отсутствуют";
      ui.gamesTable.innerHTML = emptyState();
      return;
    }
    if (!rows.length) {
      ui.gamesCount.textContent = "Ошибка данных";
      ui.gamesTable.innerHTML = mismatchState();
      return;
    }
    ui.gamesCount.textContent = `${rows.length} / 15`;
    ui.gamesTable.innerHTML = `
      <table>
        <thead><tr><th>Rank</th><th>Game</th><th>Provider</th></tr></thead>
        <tbody>${rows
          .map(
            (row) => `<tr>
              <td class="rank-cell"><strong>${row.rank}</strong></td>
              <td class="name-cell">${escapeHTML(row.game)}</td>
              <td class="subtle-cell">${escapeHTML(row.provider)}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>`;
  }

  function renderStatus(status) {
    const labels = {
      up_to_date: "Данные актуальны",
      updated: "Обновление завершено",
      attention_required: "Требуется проверка",
    };
    const label = labels[status.status] ?? String(status.status ?? "Статус не указан").replaceAll("_", " ");
    ui.statusCurrent.textContent = label;
    ui.statusUpdated.textContent = formatLongDate(status.last_updated);
    ui.statusChecked.textContent = formatLongDate(status.last_checked);
    ui.headerStatus.textContent = `${label} на ${formatDate(status.last_updated)}`;

    if (Array.isArray(status.latest_reports) && status.latest_reports.length) {
      ui.statusReports.innerHTML = `<span>Добавлены</span><strong>${status.latest_reports
        .map(formatReportLabel)
        .map(escapeHTML)
        .join("<br>")}</strong>`;
    } else {
      ui.statusReports.innerHTML = `<span>Новых отчетов не найдено</span><strong>Данные актуальны на ${escapeHTML(
        formatLongDate(status.last_updated),
      )}</strong>`;
    }
  }

  function formatReportLabel(value) {
    return String(value).replace(/(\d{4}-\d{2}-\d{2})/g, (date) => formatLongDate(date));
  }

  function updateBrandUniverse(preserveSelection) {
    const country = ui.brandsCountry.value;
    const dates = selectedDates(country, ui.brandsFrom.value, ui.brandsTo.value);
    const brands = new Set();

    dates.forEach((date) => {
      const record = availability(country, date);
      if (!record?.operators_available) return;
      operatorSnapshot(country, date).forEach((row) => brands.add(row.brand));
    });

    const latestDate = [...dates].reverse().find((date) => availability(country, date)?.operators_available);
    const latestRanks = new Map(operatorSnapshot(country, latestDate).map((row) => [row.brand, row.rank]));
    state.brandUniverse = [...brands].sort((a, b) => {
      const rankA = latestRanks.get(a) ?? 999;
      const rankB = latestRanks.get(b) ?? 999;
      return rankA - rankB || a.localeCompare(b);
    });

    if (preserveSelection) {
      state.selectedBrands = new Set(
        [...state.selectedBrands].filter((brand) => brands.has(brand)).slice(0, 8),
      );
    } else {
      state.selectedBrands.clear();
    }
    if (!state.selectedBrands.size) selectDefaultBrands();
    ui.brandSearch.value = "";
    renderBrandControls();
    renderBrandChart();
  }

  function selectDefaultBrands() {
    const country = ui.brandsCountry.value;
    const dates = selectedDates(country, ui.brandsFrom.value, ui.brandsTo.value);
    const latestDate = [...dates].reverse().find((date) => availability(country, date)?.operators_available);
    state.selectedBrands = new Set(operatorSnapshot(country, latestDate).slice(0, 5).map((row) => row.brand));
  }

  function renderBrandControls() {
    renderBrandOptions();
    const selected = [...state.selectedBrands];
    ui.brandPickerCount.textContent = `${selected.length} ${pluralRu(selected.length, "выбран", "выбрано", "выбрано")}`;
    ui.selectedBrands.innerHTML = selected
      .map((brand, index) => {
        const color = COLORS[index % COLORS.length];
        return `<button class="brand-chip" type="button" data-remove-brand="${escapeAttribute(brand)}" title="Убрать ${escapeAttribute(
          brand,
        )}"><i style="background:${color}"></i><span>${escapeHTML(brand)}</span><span aria-hidden="true">×</span></button>`;
      })
      .join("");
    ui.selectedBrands.querySelectorAll("[data-remove-brand]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedBrands.delete(button.dataset.removeBrand);
        renderBrandControls();
        renderBrandChart();
      });
    });
  }

  function renderBrandOptions() {
    const query = ui.brandSearch.value.trim().toLocaleLowerCase("ru");
    const filtered = state.brandUniverse.filter((brand) => brand.toLocaleLowerCase("ru").includes(query));
    ui.brandOptions.replaceChildren();

    if (!filtered.length) {
      const message = document.createElement("span");
      message.className = "neutral-note";
      message.textContent = state.brandUniverse.length ? "Бренды не найдены" : "Данные отсутствуют";
      ui.brandOptions.appendChild(message);
      return;
    }

    filtered.forEach((brand) => {
      const label = document.createElement("label");
      label.className = "brand-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.selectedBrands.has(brand);
      input.disabled = !input.checked && state.selectedBrands.size >= 8;
      input.addEventListener("change", () => {
        if (input.checked) state.selectedBrands.add(brand);
        else state.selectedBrands.delete(brand);
        renderBrandControls();
        renderBrandChart();
      });
      const text = document.createElement("span");
      text.textContent = brand;
      label.append(input, text);
      ui.brandOptions.appendChild(label);
    });
  }

  function renderBrandChart() {
    const country = ui.brandsCountry.value;
    const metric = ui.brandsMetric.value;
    const dates = selectedDates(country, ui.brandsFrom.value, ui.brandsTo.value);
    const availableDateCount = dates.filter((date) => availability(country, date)?.operators_available).length;
    const selected = [...state.selectedBrands];
    const metricNames = {
      aps: "APS",
      ceb_usd: "CEB",
      market_share_pct: "Market Share",
      rank: "Rank",
    };

    ui.brandChartKicker.textContent = metric === "rank" ? "Bump / rank chart" : "Observed performance";
    ui.brandChartTitle.textContent = `${country} · ${metricNames[metric]}`;
    ui.brandChartNote.textContent = dates.length
      ? `${availableDateCount} ${pluralRu(
          availableDateCount,
          "операторский срез",
          "операторских среза",
          "операторских срезов",
        )} · ${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}`
      : "Данные отсутствуют";

    if (!dates.length) {
      ui.brandChart.innerHTML = emptyState();
      ui.brandLegend.replaceChildren();
      return;
    }
    if (!selected.length) {
      ui.brandChart.innerHTML = emptyState("Выберите бренды", "На графике можно одновременно показать до восьми брендов.");
      ui.brandLegend.replaceChildren();
      return;
    }

    const rowMaps = new Map(
      dates.map((date) => [
        date,
        availability(country, date)?.operators_available
          ? new Map(operatorSnapshot(country, date).map((row) => [row.brand, row]))
          : new Map(),
      ]),
    );
    const series = selected.map((brand) => ({
      brand,
      values: dates.map((date) => rowMaps.get(date).get(brand)?.[metric] ?? null),
    }));
    const values = series.flatMap((item) => item.values).filter(Number.isFinite);
    if (!values.length) {
      ui.brandChart.innerHTML = emptyState();
      ui.brandLegend.replaceChildren();
      return;
    }

    ui.brandChart.innerHTML = buildLineChart(series, dates, metric, metricNames[metric]);
    ui.brandLegend.innerHTML = series
      .map(
        (item, index) => `<span class="legend-item"><i style="background:${COLORS[index % COLORS.length]}"></i>${escapeHTML(
          item.brand,
        )}</span>`,
      )
      .join("");
  }

  function buildLineChart(series, dates, metric, metricLabel) {
    const width = 1120;
    const height = 455;
    const margin = { top: 24, right: 28, bottom: 62, left: 92 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = series.flatMap((item) => item.values).filter(Number.isFinite);
    const isRank = metric === "rank";
    const maxValue = isRank ? 15 : niceCeil(Math.max(...values));
    const minValue = isRank ? 1 : 0;
    const timestamps = dates.map((date) => Date.parse(`${date}T00:00:00Z`));
    const firstTime = Math.min(...timestamps);
    const lastTime = Math.max(...timestamps);
    const x = (index) =>
      firstTime === lastTime
        ? margin.left + plotWidth / 2
        : margin.left + ((timestamps[index] - firstTime) / (lastTime - firstTime)) * plotWidth;
    const y = (value) => {
      if (isRank) return margin.top + ((value - 1) / 14) * plotHeight;
      return margin.top + (1 - (value - minValue) / Math.max(1, maxValue - minValue)) * plotHeight;
    };
    const tickValues = isRank ? [1, 5, 10, 15] : Array.from({ length: 5 }, (_, index) => (maxValue / 4) * index);
    const grid = tickValues
      .map((value) => {
        const yy = y(value);
        return `<line x1="${margin.left}" y1="${yy}" x2="${width - margin.right}" y2="${yy}" stroke="#2a2f37" stroke-width="1" />
          <text x="${margin.left - 14}" y="${yy + 4}" text-anchor="end" fill="#9099a5" font-size="12">${escapeHTML(
            formatAxis(value, metric),
          )}</text>`;
      })
      .join("");
    const dateGuides = dates
      .map((date, index) => {
        const xx = x(index);
        return `<line x1="${xx}" y1="${margin.top}" x2="${xx}" y2="${height - margin.bottom}" stroke="#20242a" stroke-width="1" stroke-dasharray="2 5" />
          <text x="${xx}" y="${height - 27}" text-anchor="middle" fill="#9099a5" font-size="12">${formatShortDate(
            date,
          )}</text>`;
      })
      .join("");
    const marks = series
      .map((item, seriesIndex) => {
        const color = COLORS[seriesIndex % COLORS.length];
        const segments = [];
        let current = [];
        item.values.forEach((value, index) => {
          if (Number.isFinite(value)) current.push({ x: x(index), y: y(value), value, date: dates[index] });
          else if (current.length) {
            segments.push(current);
            current = [];
          }
        });
        if (current.length) segments.push(current);
        return segments
          .map((segment) => {
            const path =
              segment.length > 1
                ? `<path d="${segment.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
                : "";
            const points = segment
              .map(
                (point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${color}" stroke="#0a0b0d" stroke-width="2.5">
                  <title>${escapeHTML(item.brand)} · ${formatDate(point.date)} · ${escapeHTML(
                    formatMetricValue(point.value, metric),
                  )}</title>
                </circle>`,
              )
              .join("");
            return path + points;
          })
          .join("");
      })
      .join("");

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(
      `${metricLabel}: реальные наблюдения по датам от ${formatDate(dates[0])} до ${formatDate(dates[dates.length - 1])}`,
    )}">
      <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#0d0f12" rx="8" />
      ${dateGuides}${grid}${marks}
      <text x="18" y="${margin.top + plotHeight / 2}" transform="rotate(-90 18 ${
        margin.top + plotHeight / 2
      })" text-anchor="middle" fill="#9099a5" font-size="12">${escapeHTML(metricLabel)}</text>
    </svg>`;
  }

  function niceCeil(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    const normalized = value / power;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * power;
  }

  function renderMarket() {
    const country = ui.marketCountry.value;
    const dates = selectedDates(country, ui.marketFrom.value, ui.marketTo.value);
    if (!dates.length) {
      ui.marketContent.innerHTML = emptyState();
      return;
    }
    if (state.marketMode === "games") renderGameDynamics(country, dates);
    else renderOperatorDynamics(country, dates);
  }

  function renderOperatorDynamics(country, allDates) {
    const dates = allDates.filter((date) => availability(country, date)?.operators_available);
    if (!dates.length) {
      ui.marketContent.innerHTML = emptyState();
      return;
    }

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const firstRows = operatorSnapshot(country, firstDate);
    const lastRows = operatorSnapshot(country, lastDate);
    if (!lastRows.length) {
      ui.marketContent.innerHTML = mismatchState();
      return;
    }

    const comparisonAvailable = dates.length > 1 && firstRows.length > 0;
    const comparison = comparisonAvailable ? compareRankings(firstRows, lastRows, "brand") : null;
    const commonMovements = comparison
      ? comparison.common.map(({ name, before, after }) => ({
          name,
          rankDelta: before.rank - after.rank,
          shareDelta:
            Number.isFinite(before.market_share_pct) && Number.isFinite(after.market_share_pct)
              ? after.market_share_pct - before.market_share_pct
              : null,
        }))
      : [];
    const gainers = commonMovements
      .filter((item) => item.rankDelta > 0)
      .sort((a, b) => b.rankDelta - a.rankDelta || (b.shareDelta ?? -Infinity) - (a.shareDelta ?? -Infinity))
      .slice(0, 5);
    const decliners = commonMovements
      .filter((item) => item.rankDelta < 0)
      .sort((a, b) => a.rankDelta - b.rankDelta || (a.shareDelta ?? Infinity) - (b.shareDelta ?? Infinity))
      .slice(0, 5);
    const cr3 = sumPublishedShare(lastRows, 3);
    const cr5 = sumPublishedShare(lastRows, 5);

    ui.marketContent.innerHTML = `
      ${comparisonStrip(country, firstDate, lastDate, dates.length, "операторских")}
      <div class="kpi-grid">
        ${kpiCard("CR3", cr3 == null ? "—" : formatShare(cr3), `Published share · ${formatDate(lastDate)}`)}
        ${kpiCard("CR5", cr5 == null ? "—" : formatShare(cr5), `Published share · ${formatDate(lastDate)}`)}
        ${kpiCard(
          "New to Top-15",
          comparisonAvailable ? comparison.entered.length : "—",
          comparisonAvailable ? `vs ${formatDate(firstDate)}` : "Нужны два среза",
        )}
        ${kpiCard(
          "Dropped from Top-15",
          comparisonAvailable ? comparison.dropped.length : "—",
          comparisonAvailable ? `vs ${formatDate(firstDate)}` : "Нужны два среза",
        )}
      </div>
      <div class="market-grid">
        <article class="panel span-4">
          ${panelHeader("Current leaders", `Top-5 · ${formatDate(lastDate)}`)}
          <div class="panel-body">
            <ol class="leader-list">${lastRows
              .slice(0, 5)
              .map(
                (row) => `<li class="leader-row"><span class="leader-row__rank">#${row.rank}</span><span class="leader-row__name">${escapeHTML(
                  row.brand,
                )}</span><span class="numeric">${formatShare(row.market_share_pct)}</span></li>`,
              )
              .join("")}</ol>
          </div>
        </article>
        <article class="panel span-8">
          ${panelHeader("Rank movement", comparisonAvailable ? `${formatDate(firstDate)} → ${formatDate(lastDate)}` : "Сравнение недоступно")}
          <div class="panel-body">
            ${
              comparisonAvailable
                ? `<div class="change-columns">
                    <section><h4 class="subsection-title">Biggest gainers</h4>${movementList(gainers)}</section>
                    <section><h4 class="subsection-title">Biggest decliners</h4>${movementList(decliners)}</section>
                  </div>`
                : `<span class="neutral-note">Для расчёта изменений нужны как минимум два доступных отчёта.</span>`
            }
          </div>
        </article>
        <article class="panel span-12">
          ${panelHeader("Top-15 changes", "Изменение состава опубликованного рейтинга, а не выход на рынок")}
          <div class="panel-body change-columns">
            <section><h4 class="subsection-title">New to Top-15</h4>${
              comparisonAvailable ? tagList(comparison.entered) : `<span class="neutral-note">Сравнение недоступно</span>`
            }</section>
            <section><h4 class="subsection-title">Dropped from Top-15</h4>${
              comparisonAvailable ? tagList(comparison.dropped) : `<span class="neutral-note">Сравнение недоступно</span>`
            }</section>
          </div>
        </article>
      </div>`;
  }

  function renderGameDynamics(country, allDates) {
    const availableDates = allDates.filter((date) => availability(country, date)?.games_available);
    if (!availableDates.length) {
      ui.marketContent.innerHTML = emptyState();
      return;
    }

    const rowsByDate = new Map(availableDates.map((date) => [date, gameSnapshot(country, date)]));
    if ([...rowsByDate.values()].some((rows) => !rows.length)) {
      ui.marketContent.innerHTML = mismatchState();
      return;
    }

    const firstDate = availableDates[0];
    const lastDate = availableDates[availableDates.length - 1];
    const firstRows = rowsByDate.get(firstDate);
    const lastRows = rowsByDate.get(lastDate);
    const stats = calculateGameStats(rowsByDate, availableDates);
    const comparisonAvailable = availableDates.length > 1;
    const comparison = comparisonAvailable ? compareRankings(firstRows, lastRows, "game") : null;
    const movers = comparison
      ? comparison.common
          .map(({ name, before, after }) => ({ name, rankDelta: before.rank - after.rank, shareDelta: null }))
          .filter((item) => item.rankDelta !== 0)
          .sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta) || b.rankDelta - a.rankDelta)
          .slice(0, 8)
      : [];
    const leadership = [...stats].sort(
      (a, b) => b.leadership - a.leadership || b.top5 - a.top5 || b.appearances - a.appearances || a.averageRank - b.averageRank,
    )[0];
    const persistence = [...stats].sort(
      (a, b) => b.longestStreak - a.longestStreak || b.appearanceRate - a.appearanceRate || a.averageRank - b.averageRank,
    )[0];

    ui.marketContent.innerHTML = `
      ${comparisonStrip(country, firstDate, lastDate, availableDates.length, "игровых")}
      <div class="kpi-grid">
        ${kpiCard("Game reports", availableDates.length, `из ${allDates.length} реальных дат периода`)}
        ${kpiCard(
          "#1 leadership",
          leadership?.game ?? "—",
          leadership ? `${leadership.leadership} × на позиции #1` : "Данные отсутствуют",
          true,
        )}
        ${kpiCard(
          "Top-15 persistence",
          persistence?.game ?? "—",
          persistence
            ? `серия ${persistence.longestStreak} из ${availableDates.length} ${pluralRu(
                availableDates.length,
                "среза",
                "срезов",
                "срезов",
              )}`
            : "Данные отсутствуют",
          true,
        )}
        ${kpiCard("Unique games", stats.length, "в доступных опубликованных Top-15")}
      </div>
      <div class="market-grid">
        <article class="panel span-5">
          ${panelHeader("Biggest rank movers", comparisonAvailable ? `${formatDate(firstDate)} → ${formatDate(lastDate)}` : "Сравнение недоступно")}
          <div class="panel-body">${
            comparisonAvailable
              ? movementList(movers, true)
              : `<span class="neutral-note">Для расчёта изменений нужны как минимум два игровых среза.</span>`
          }</div>
        </article>
        <article class="panel span-7">
          ${panelHeader("Top-15 changes", "Состав первого и последнего игрового рейтинга периода")}
          <div class="panel-body change-columns">
            <section><h4 class="subsection-title">New to Top-15</h4>${
              comparisonAvailable ? tagList(comparison.entered) : `<span class="neutral-note">Сравнение недоступно</span>`
            }</section>
            <section><h4 class="subsection-title">Dropped from Top-15</h4>${
              comparisonAvailable ? tagList(comparison.dropped) : `<span class="neutral-note">Сравнение недоступно</span>`
            }</section>
          </div>
        </article>
        <article class="panel span-12">
          ${panelHeader("Game performance", "Метрики рассчитываются только по периодам с опубликованными игровыми данными")}
          <div class="analytics-table-wrap">${gameStatsTable(stats, availableDates.length)}</div>
        </article>
        <article class="panel span-12">
          ${panelHeader("Rank-history matrix", "Даты слева направо: oldest → newest")}
          <div class="matrix-wrap">${rankMatrix(stats, allDates, country)}</div>
        </article>
        <article class="panel span-12">
          ${panelHeader("Provider Top-15 Footprint", `Количество игр провайдера в Top-15 · ${formatDate(lastDate)} · не market share`)}
          <div class="panel-body">${providerFootprint(lastRows)}</div>
        </article>
      </div>`;
  }

  function calculateGameStats(rowsByDate, availableDates) {
    const games = new Map();
    availableDates.forEach((date) => {
      rowsByDate.get(date).forEach((row) => {
        if (!games.has(row.game)) games.set(row.game, { provider: row.provider, ranks: new Map() });
        games.get(row.game).ranks.set(date, row.rank);
      });
    });

    return [...games.entries()]
      .map(([game, record]) => {
        const observedRanks = [...record.ranks.values()];
        let longestStreak = 0;
        let currentStreak = 0;
        availableDates.forEach((date) => {
          if (record.ranks.has(date)) {
            currentStreak += 1;
            longestStreak = Math.max(longestStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
        });
        return {
          game,
          provider: record.provider,
          ranks: record.ranks,
          appearances: observedRanks.length,
          appearanceRate: observedRanks.length / availableDates.length,
          leadership: observedRanks.filter((rank) => rank === 1).length,
          top5: observedRanks.filter((rank) => rank <= 5).length,
          averageRank: observedRanks.reduce((sum, rank) => sum + rank, 0) / observedRanks.length,
          longestStreak,
          bestRank: Math.min(...observedRanks),
        };
      })
      .sort(
        (a, b) =>
          b.appearanceRate - a.appearanceRate ||
          b.longestStreak - a.longestStreak ||
          a.averageRank - b.averageRank ||
          a.game.localeCompare(b.game),
      );
  }

  function gameStatsTable(stats, totalPeriods) {
    return `<table class="analytics-table">
      <thead><tr><th>Game</th><th>Provider</th><th class="numeric">Top-15 persistence</th><th class="numeric">#1 leadership</th><th class="numeric">Top-5 presence</th><th class="numeric">Average rank</th><th class="numeric">Appearance rate</th></tr></thead>
      <tbody>${stats
        .map(
          (item) => `<tr>
            <td class="name-cell">${escapeHTML(item.game)}</td>
            <td class="subtle-cell">${escapeHTML(item.provider)}</td>
            <td class="numeric">${item.longestStreak} ${pluralRu(item.longestStreak, "срез", "среза", "срезов")}</td>
            <td class="numeric">${item.leadership} / ${totalPeriods}</td>
            <td class="numeric">${item.top5} / ${totalPeriods}</td>
            <td class="numeric">${item.averageRank.toLocaleString("ru-RU", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}</td>
            <td class="numeric">${formatPercent(item.appearanceRate * 100, 0)}</td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }

  function rankMatrix(stats, dates, country) {
    return `<table class="matrix-table">
      <thead><tr><th>Game</th>${dates.map((date) => `<th>${formatShortDate(date)}</th>`).join("")}</tr></thead>
      <tbody>${stats
        .map(
          (item) => `<tr><td><span class="name-cell">${escapeHTML(item.game)}</span><br><span class="subtle-cell">${escapeHTML(
            item.provider,
          )}</span></td>${dates
            .map((date) => {
              const record = availability(country, date);
              if (!record?.games_available) return `<td><span class="na-pill">Данные отсутствуют</span></td>`;
              const rank = item.ranks.get(date);
              if (!Number.isFinite(rank)) return `<td><span class="out-pill">OUT OF TOP-15</span></td>`;
              return `<td><span class="rank-pill ${rank <= 5 ? "rank-pill--top" : ""}">${rank}</span></td>`;
            })
            .join("")}</tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }

  function providerFootprint(rows) {
    const counts = new Map();
    rows.forEach((row) => counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1));
    const providers = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const max = Math.max(...providers.map(([, count]) => count));
    return `<div class="provider-bars">${providers
      .map(
        ([provider, count]) => `<div class="provider-row">
          <span class="provider-row__label" title="${escapeAttribute(provider)}">${escapeHTML(provider)}</span>
          <span class="provider-row__track"><span class="provider-row__fill" style="width:${(count / max) * 100}%"></span></span>
          <strong class="provider-row__count">${count}</strong>
        </div>`,
      )
      .join("")}</div>`;
  }

  function compareRankings(beforeRows, afterRows, identityField) {
    const before = new Map(beforeRows.map((row) => [row[identityField], row]));
    const after = new Map(afterRows.map((row) => [row[identityField], row]));
    return {
      common: [...after.keys()]
        .filter((name) => before.has(name))
        .map((name) => ({ name, before: before.get(name), after: after.get(name) })),
      entered: [...after.keys()].filter((name) => !before.has(name)),
      dropped: [...before.keys()].filter((name) => !after.has(name)),
    };
  }

  function sumPublishedShare(rows, topCount) {
    const selected = rows.filter((row) => row.rank <= topCount);
    if (selected.length !== topCount || selected.some((row) => !Number.isFinite(row.market_share_pct))) return null;
    return selected.reduce((sum, row) => sum + row.market_share_pct, 0);
  }

  function movementList(items, gamesOnly = false) {
    if (!items.length) return `<span class="neutral-note">Изменений не зафиксировано</span>`;
    return `<ul class="movement-list">${items
      .map((item) => {
        const direction = item.rankDelta > 0 ? "↑" : "↓";
        const className = item.rankDelta > 0 ? "positive" : "negative";
        const share =
          !gamesOnly && Number.isFinite(item.shareDelta)
            ? ` · ${item.shareDelta >= 0 ? "+" : ""}${item.shareDelta.toFixed(2)} pp`
            : "";
        return `<li class="movement-row"><span class="movement-row__name">${escapeHTML(
          item.name,
        )}</span><span class="movement-row__value ${className}">${direction} ${Math.abs(
          item.rankDelta,
        )} поз.${share}</span></li>`;
      })
      .join("")}</ul>`;
  }

  function tagList(items) {
    if (!items.length) return `<span class="neutral-note">Изменений нет</span>`;
    return `<ul class="tag-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function comparisonStrip(country, firstDate, lastDate, periodCount, type) {
    const detail =
      periodCount > 1
        ? `<strong>${formatDate(firstDate)}</strong><span aria-hidden="true">→</span><strong>${formatDate(lastDate)}</strong>`
        : `<strong>${formatDate(lastDate)}</strong><span>только один доступный срез</span>`;
    return `<div class="comparison-strip"><span><strong>${escapeHTML(country)}</strong> · ${periodCount} ${type} ${pluralRu(
      periodCount,
      "срез",
      "среза",
      "срезов",
    )}</span><span>${detail}</span></div>`;
  }

  function kpiCard(label, value, meta, isName = false) {
    return `<article class="kpi-card"><span class="kpi-label">${escapeHTML(label)}</span><strong class="kpi-value ${
      isName ? "kpi-value--name" : ""
    }" title="${escapeAttribute(value)}">${escapeHTML(value)}</strong><span class="kpi-meta">${escapeHTML(meta)}</span></article>`;
  }

  function panelHeader(title, note) {
    return `<header class="panel-header"><div><p class="section-kicker">Analysis</p><h3>${escapeHTML(
      title,
    )}</h3></div><span class="chart-note">${escapeHTML(note)}</span></header>`;
  }

  function emptyState(title = "Данные отсутствуют", detail = "") {
    return `<div class="empty-state"><div><span class="empty-state__mark" aria-hidden="true">×</span><strong>${escapeHTML(
      title,
    )}</strong>${detail ? `<p>${escapeHTML(detail)}</p>` : ""}</div></div>`;
  }

  function mismatchState() {
    return emptyState(
      "Несогласованность данных",
      "availability.csv отмечает срез как доступный, но соответствующие строки не загружены.",
    );
  }

  function renderFooter() {
    const observedCountries = [...state.data.datesByCountry.keys()].length;
    const periods = state.data.availability.length;
    ui.footerCoverage.textContent = `${observedCountries} рынков с наблюдениями · ${periods} country-period records`;
  }

  function formatDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) return "—";
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${String(day).padStart(2, "0")} ${SHORT_MONTHS[month - 1]} ${year}`;
  }

  function formatShortDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) return "—";
    const [, month, day] = isoDate.split("-").map(Number);
    return `${String(day).padStart(2, "0")} ${SHORT_MONTHS[month - 1]}`;
  }

  function formatLongDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))) return "—";
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${day} ${RU_MONTHS[month - 1]} ${year}`;
  }

  function formatInteger(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return "—";
    return `$${formatCompact(value)}`;
  }

  function formatCompact(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1e9) return `${trimZeros(value / 1e9)}B`;
    if (absolute >= 1e6) return `${trimZeros(value / 1e6)}M`;
    if (absolute >= 1e3) return `${trimZeros(value / 1e3)}K`;
    return trimZeros(value);
  }

  function trimZeros(value) {
    return Number(value.toFixed(2)).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  }

  function formatShare(value) {
    return Number.isFinite(value) ? formatPercent(value, 2) : "—";
  }

  function formatPercent(value, digits) {
    return `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;
  }

  function formatAxis(value, metric) {
    if (metric === "rank") return String(Math.round(value));
    if (metric === "market_share_pct") return `${trimZeros(value)}%`;
    if (metric === "ceb_usd") return `$${formatCompact(value)}`;
    return formatCompact(value);
  }

  function formatMetricValue(value, metric) {
    if (metric === "rank") return `Rank ${Math.round(value)}`;
    if (metric === "market_share_pct") return formatShare(value);
    if (metric === "ceb_usd") return formatCurrency(value);
    return formatInteger(value);
  }

  function pluralRu(value, one, few, many) {
    const number = Math.abs(Number(value)) % 100;
    const last = number % 10;
    if (number > 10 && number < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return entities[character];
    });
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replace(/`/g, "&#096;");
  }
})();
