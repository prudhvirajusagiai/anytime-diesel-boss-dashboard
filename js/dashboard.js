/* ============================================================
   ANYTIME DIESEL — BOSS SALES DASHBOARD
   File: js/dashboard.js
   Version: 1.0
   ============================================================ */

(() => {
  "use strict";

  /* ============================================================
     CONFIGURATION
     ============================================================ */

  const GOOGLE_SHEETS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQSg4Wwyn0VlanOxRrWFL8hplD-WL0vxHKLNeU1o1mOoRkwHjNPH4ndE9Y29z4OBg/pub?gid=1079011675&single=true&output=csv";

  const API_URL = "/api/sheets";

  const REFRESH_INTERVAL = 5 * 60 * 1000;

  const EXPECTED_HEADERS = [
    "company",
    "sector",
    "value",
    "stage",
    "probability",
    "owner",
    "month"
  ];

  let salesData = [];
  let filteredData = [];

  let currentFilters = {
    search: "",
    sector: "",
    stage: "",
    owner: "",
    month: ""
  };

  let charts = {};

  /* ============================================================
     DOM HELPERS
     ============================================================ */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function findElement(...selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  function setText(selectors, value) {
    const element = findElement(...selectors);

    if (element) {
      element.textContent = value;
    }
  }

  function setHTML(selectors, value) {
    const element = findElement(...selectors);

    if (element) {
      element.innerHTML = value;
    }
  }

  /* ============================================================
     INITIALIZATION
     ============================================================ */

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    setupNavigation();
    setupFilters();
    setupButtons();

    await loadDashboardData();

    window.setInterval(() => {
      loadDashboardData();
    }, REFRESH_INTERVAL);
  }

  /* ============================================================
     LOAD DATA
     ============================================================ */

  async function loadDashboardData() {
    showLoadingState();

    try {
      const url =
        API_URL +
        "?url=" +
        encodeURIComponent(GOOGLE_SHEETS_CSV_URL);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/csv,text/plain,*/*"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status} ${response.statusText}`
        );
      }

      const csvText = await response.text();

      if (!csvText || !csvText.trim()) {
        throw new Error("Google Sheets returned empty data.");
      }

      const parsed = parseCSV(csvText);

      salesData = cleanSalesData(parsed);

      filteredData = [...salesData];

      populateFilters(salesData);

      renderDashboard();

      hideLoadingState();

      showDataStatus(
        `Live data loaded • ${salesData.length} opportunities`
      );
    } catch (error) {
      console.error("Dashboard data error:", error);

      hideLoadingState();

      showDataStatus(
        "Unable to load live Google Sheets data",
        true
      );

      renderEmptyState(error.message);
    }
  }

  /* ============================================================
     CSV PARSER
     ============================================================ */

  function parseCSV(text) {
    const rows = [];

    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"' && insideQuotes && nextChar === '"') {
        field += '"';
        i++;
        continue;
      }

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (char === "," && !insideQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if (
        (char === "\n" || char === "\r") &&
        !insideQuotes
      ) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }

        row.push(field);
        field = "";

        if (row.some(value => String(value).trim() !== "")) {
          rows.push(row);
        }

        row = [];
        continue;
      }

      field += char;
    }

    if (field !== "" || row.length > 0) {
      row.push(field);

      if (row.some(value => String(value).trim() !== "")) {
        rows.push(row);
      }
    }

    if (!rows.length) {
      return [];
    }

    const headers = rows[0].map(header =>
      String(header)
        .trim()
        .toLowerCase()
    );

    return rows.slice(1).map(values => {
      const record = {};

      headers.forEach((header, index) => {
        record[header] =
          values[index] !== undefined
            ? String(values[index]).trim()
            : "";
      });

      return record;
    });
  }

  /* ============================================================
     CLEAN DATA
     ============================================================ */

  function cleanSalesData(records) {
    return records
      .map(record => normalizeRecord(record))
      .filter(record => isValidSalesRecord(record));
  }

  function normalizeRecord(record) {
    return {
      company: cleanString(record.company),
      sector: cleanString(record.sector),
      value: parseMoney(record.value),
      valueRaw: cleanString(record.value),
      stage: cleanString(record.stage),
      probability: parseProbability(record.probability),
      owner: cleanString(record.owner),
      month: cleanString(record.month)
    };
  }

  function isValidSalesRecord(record) {
    if (!record) {
      return false;
    }

    const combined = [
      record.company,
      record.sector,
      record.valueRaw,
      record.stage,
      record.probability,
      record.owner,
      record.month
    ]
      .join(" ")
      .trim()
      .toLowerCase();

    if (!combined) {
      return false;
    }

    /*
     * Remove the management/public-use note that exists
     * in the published Google Sheet.
     */
    if (
      combined.includes("public / boss view only") ||
      combined.includes("do not add mobile numbers") ||
      combined.includes("private crm notes")
    ) {
      return false;
    }

    /*
     * A valid sales record must at least contain:
     * company + sector + stage.
     */
    if (!record.company) {
      return false;
    }

    if (!record.sector) {
      return false;
    }

    if (!record.stage) {
      return false;
    }

    /*
     * Reject rows that are clearly CSV formatting artifacts.
     */
    if (
      /^,+$/.test(record.company) ||
      /^,+$/.test(record.sector)
    ) {
      return false;
    }

    return true;
  }

  function cleanString(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/\uFEFF/g, "")
      .trim();
  }

  function parseMoney(value) {
    if (value === null || value === undefined) {
      return 0;
    }

    const cleaned = String(value)
      .replace(/₹/g, "")
      .replace(/Rs\.?/gi, "")
      .replace(/INR/gi, "")
      .replace(/,/g, "")
      .replace(/\s/g, "")
      .trim();

    const number = Number(cleaned);

    return Number.isFinite(number) ? number : 0;
  }

  function parseProbability(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }

    let number = Number(
      String(value)
        .replace("%", "")
        .trim()
    );

    if (!Number.isFinite(number)) {
      return 0;
    }

    if (number > 1 && number <= 100) {
      return number;
    }

    if (number >= 0 && number <= 1) {
      return number * 100;
    }

    return Math.max(0, Math.min(100, number));
  }

  /* ============================================================
     DASHBOARD CALCULATIONS
     ============================================================ */

  function calculateMetrics(data) {
    const totalPipeline = data.reduce(
      (sum, record) => sum + record.value,
      0
    );

    const weightedPipeline = data.reduce(
      (sum, record) =>
        sum +
        record.value *
          (record.probability / 100),
      0
    );

    const opportunityCount = data.length;

    const averageDeal =
      opportunityCount > 0
        ? totalPipeline / opportunityCount
        : 0;

    const wonData = data.filter(
      record =>
        normalizeStage(record.stage) === "won"
    );

    const lostData = data.filter(
      record =>
        normalizeStage(record.stage) === "lost"
    );

    const activeData = data.filter(record => {
      const stage = normalizeStage(record.stage);

      return (
        stage !== "won" &&
        stage !== "lost"
      );
    });

    const wonValue = wonData.reduce(
      (sum, record) => sum + record.value,
      0
    );

    const activePipeline = activeData.reduce(
      (sum, record) => sum + record.value,
      0
    );

    const weightedActivePipeline =
      activeData.reduce(
        (sum, record) =>
          sum +
          record.value *
            (record.probability / 100),
        0
      );

    const conversionRate =
      opportunityCount > 0
        ? (wonData.length / opportunityCount) * 100
        : 0;

    return {
      totalPipeline,
      weightedPipeline,
      opportunityCount,
      averageDeal,
      wonCount: wonData.length,
      wonValue,
      lostCount: lostData.length,
      activeCount: activeData.length,
      activePipeline,
      weightedActivePipeline,
      conversionRate
    };
  }

  /* ============================================================
     RENDER DASHBOARD
     ============================================================ */

  function renderDashboard() {
    const metrics = calculateMetrics(filteredData);

    updateKPI("pipeline", metrics.totalPipeline);
    updateKPI(
      "weighted",
      metrics.weightedPipeline
    );
    updateKPI(
      "opportunities",
      metrics.opportunityCount
    );
    updateKPI(
      "average",
      metrics.averageDeal
    );
    updateKPI(
      "won",
      metrics.wonValue
    );
    updateKPI(
      "active",
      metrics.activeCount
    );

    updateCharts(filteredData);

    renderTopOpportunities(filteredData);

    renderManagementView(filteredData);

    renderDataTable(filteredData);

    updateResultCount(filteredData.length);
  }

  /* ============================================================
     KPI UPDATES
     ============================================================ */

  function updateKPI(type, value) {
    const selectors = {
      pipeline: [
        "#totalPipeline",
        "#pipelineValue",
        "[data-kpi='pipeline']",
        "[data-metric='pipeline']"
      ],

      weighted: [
        "#weightedPipeline",
        "#weightedValue",
        "[data-kpi='weighted']",
        "[data-metric='weighted']"
      ],

      opportunities: [
        "#opportunityCount",
        "#opportunities",
        "[data-kpi='opportunities']",
        "[data-metric='opportunities']"
      ],

      average: [
        "#averageDeal",
        "#averageDealValue",
        "[data-kpi='average']",
        "[data-metric='average']"
      ],

      won: [
        "#wonValue",
        "#closedWon",
        "[data-kpi='won']",
        "[data-metric='won']"
      ],

      active: [
        "#activeCount",
        "#activeOpportunities",
        "[data-kpi='active']",
        "[data-metric='active']"
      ]
    };

    const element = findElement(
      ...selectors[type]
    );

    if (!element) {
      return;
    }

    if (
      type === "opportunities" ||
      type === "active"
    ) {
      element.textContent =
        Number(value || 0).toLocaleString("en-IN");

      return;
    }

    element.textContent = formatCurrency(value);
  }

  /* ============================================================
     CURRENCY FORMAT
     ============================================================ */

  function formatCurrency(value) {
    const number = Number(value) || 0;

    return (
      "₹" +
      number.toLocaleString("en-IN", {
        maximumFractionDigits: 0
      })
    );
  }

  function formatCompactCurrency(value) {
    const number = Number(value) || 0;

    if (number >= 10000000) {
      return (
        "₹" +
        (number / 10000000).toFixed(2) +
        " Cr"
      );
    }

    if (number >= 100000) {
      return (
        "₹" +
        (number / 100000).toFixed(2) +
        " L"
      );
    }

    if (number >= 1000) {
      return (
        "₹" +
        (number / 1000).toFixed(1) +
        " K"
      );
    }

    return formatCurrency(number);
  }

  /* ============================================================
     FILTERS
     ============================================================ */

  function setupFilters() {
    const search = findElement(
      "#searchInput",
      "#search",
      "[data-filter='search']"
    );

    if (search) {
      search.addEventListener(
        "input",
        event => {
          currentFilters.search =
            event.target.value.trim();

          applyFilters();
        }
      );
    }

    bindFilter(
      [
        "#sectorFilter",
        "#sector",
        "[data-filter='sector']"
      ],
      "sector"
    );

    bindFilter(
      [
        "#stageFilter",
        "#stage",
        "[data-filter='stage']"
      ],
      "stage"
    );

    bindFilter(
      [
        "#ownerFilter",
        "#owner",
        "[data-filter='owner']"
      ],
      "owner"
    );

    bindFilter(
      [
        "#monthFilter",
        "#month",
        "[data-filter='month']"
      ],
      "month"
    );
  }

  function bindFilter(selectors, filterName) {
    const element = findElement(...selectors);

    if (!element) {
      return;
    }

    element.addEventListener(
      "change",
      event => {
        currentFilters[filterName] =
          event.target.value;

        applyFilters();
      }
    );
  }

  function populateFilters(data) {
    populateSelect(
      [
        "#sectorFilter",
        "#sector",
        "[data-filter='sector']"
      ],
      uniqueSorted(
        data.map(record => record.sector)
      ),
      "All Sectors"
    );

    populateSelect(
      [
        "#stageFilter",
        "#stage",
        "[data-filter='stage']"
      ],
      uniqueSorted(
        data.map(record => record.stage)
      ),
      "All Stages"
    );

    populateSelect(
      [
        "#ownerFilter",
        "#owner",
        "[data-filter='owner']"
      ],
      uniqueSorted(
        data.map(record => record.owner)
      ),
      "All Owners"
    );

    populateSelect(
      [
        "#monthFilter",
        "#month",
        "[data-filter='month']"
      ],
      uniqueSorted(
        data.map(record => record.month)
      ),
      "All Months"
    );
  }

  function populateSelect(
    selectors,
    values,
    placeholder
  ) {
    const element = findElement(...selectors);

    if (!element) {
      return;
    }

    const previousValue =
      element.value;

    element.innerHTML = "";

    const defaultOption =
      document.createElement("option");

    defaultOption.value = "";
    defaultOption.textContent =
      placeholder;

    element.appendChild(defaultOption);

    values
      .filter(Boolean)
      .forEach(value => {
        const option =
          document.createElement("option");

        option.value = value;
        option.textContent = value;

        element.appendChild(option);
      });

    if (
      values.includes(previousValue)
    ) {
      element.value = previousValue;
    }
  }

  function uniqueSorted(values) {
    return [
      ...new Set(
        values
          .map(value => cleanString(value))
          .filter(Boolean)
      )
    ].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function applyFilters() {
    filteredData = salesData.filter(
      record => {
        const search =
          currentFilters.search.toLowerCase();

        const searchableText = [
          record.company,
          record.sector,
          record.stage,
          record.owner,
          record.month
        ]
          .join(" ")
          .toLowerCase();

        if (
          search &&
          !searchableText.includes(search)
        ) {
          return false;
        }

        if (
          currentFilters.sector &&
          record.sector !==
            currentFilters.sector
        ) {
          return false;
        }

        if (
          currentFilters.stage &&
          record.stage !==
            currentFilters.stage
        ) {
          return false;
        }

        if (
          currentFilters.owner &&
          record.owner !==
            currentFilters.owner
        ) {
          return false;
        }

        if (
          currentFilters.month &&
          record.month !==
            currentFilters.month
        ) {
          return false;
        }

        return true;
      }
    );

    renderDashboard();
  }

  /* ============================================================
     RESET FILTERS
     ============================================================ */

  function resetFilters() {
    currentFilters = {
      search: "",
      sector: "",
      stage: "",
      owner: "",
      month: ""
    };

    $all(
      "input[data-filter], select[data-filter], " +
      "#searchInput, #search, #sectorFilter, " +
      "#sector, #stageFilter, #stage, " +
      "#ownerFilter, #owner, #monthFilter, #month"
    ).forEach(element => {
      element.value = "";
    });

    filteredData = [...salesData];

    renderDashboard();
  }

  /* ============================================================
     TOP OPPORTUNITIES
     ============================================================ */

  function renderTopOpportunities(data) {
    const container = findElement(
      "#topOpportunities",
      "#opportunityList",
      "#topOpportunityList",
      "[data-section='top-opportunities']"
    );

    if (!container) {
      return;
    }

    const top = [...data]
      .sort((a, b) => {
        const weightedA =
          a.value *
          (a.probability / 100);

        const weightedB =
          b.value *
          (b.probability / 100);

        return weightedB - weightedA;
      })
      .slice(0, 10);

    if (!top.length) {
      container.innerHTML =
        emptyMessage(
          "No opportunities found."
        );

      return;
    }

    container.innerHTML = top
      .map(record => {
        return `
          <div class="opportunity-row">
            <div class="opportunity-company">
              <strong>${escapeHTML(
                record.company
              )}</strong>
              <span>${escapeHTML(
                record.sector
              )}</span>
            </div>

            <div class="opportunity-value">
              ${formatCurrency(
                record.value
              )}
            </div>

            <div class="opportunity-stage">
              <span class="stage-badge ${stageClass(
                record.stage
              )}">
                ${escapeHTML(
                  record.stage || "—"
                )}
              </span>
            </div>

            <div class="opportunity-probability">
              ${Math.round(
                record.probability
              )}%
            </div>
          </div>
        `;
      })
      .join("");
  }

  /* ============================================================
     MANAGEMENT VIEW
     ============================================================ */

  function renderManagementView(data) {
    const container = findElement(
      "#managementView",
      "#managementTable",
      "#managementData",
      "[data-section='management']"
    );

    if (!container) {
      return;
    }

    if (!data.length) {
      container.innerHTML =
        emptyMessage(
          "No management data available."
        );

      return;
    }

    const ownerMap = {};

    data.forEach(record => {
      const owner =
        record.owner || "Unassigned";

      if (!ownerMap[owner]) {
        ownerMap[owner] = {
          count: 0,
          value: 0,
          weighted: 0
        };
      }

      ownerMap[owner].count += 1;
      ownerMap[owner].value +=
        record.value;

      ownerMap[owner].weighted +=
        record.value *
        (record.probability / 100);
    });

    const owners = Object.entries(
      ownerMap
    ).sort(
      (a, b) =>
        b[1].value - a[1].value
    );

    container.innerHTML = owners
      .map(([owner, stats]) => {
        return `
          <div class="management-row">
            <div>
              <strong>${escapeHTML(
                owner
              )}</strong>
            </div>

            <div>
              ${stats.count}
            </div>

            <div>
              ${formatCompactCurrency(
                stats.value
              )}
            </div>

            <div>
              ${formatCompactCurrency(
                stats.weighted
              )}
            </div>
          </div>
        `;
      })
      .join("");
  }

  /* ============================================================
     DATA TABLE
     ============================================================ */

  function renderDataTable(data) {
    const tbody = findElement(
      "#salesTableBody",
      "#opportunitiesTableBody",
      "#dataTableBody",
      "tbody[data-table='sales']"
    );

    if (!tbody) {
      return;
    }

    if (!data.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            ${emptyMessage(
              "No matching opportunities."
            )}
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = data
      .map(record => {
        return `
          <tr>
            <td>
              <strong>${escapeHTML(
                record.company
              )}</strong>
            </td>

            <td>
              ${escapeHTML(
                record.sector
              )}
            </td>

            <td>
              ${formatCurrency(
                record.value
              )}
            </td>

            <td>
              <span class="stage-badge ${stageClass(
                record.stage
              )}">
                ${escapeHTML(
                  record.stage
                )}
              </span>
            </td>

            <td>
              ${Math.round(
                record.probability
              )}%
            </td>

            <td>
              ${escapeHTML(
                record.owner || "—"
              )}
            </td>

            <td>
              ${escapeHTML(
                record.month || "—"
              )}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  /* ============================================================
     CHARTS
     ============================================================ */

  function updateCharts(data) {
    /*
     * Chart.js is optional.
     * The dashboard continues working without it.
     */

    if (
      typeof window.Chart === "undefined"
    ) {
      return;
    }

    renderSectorChart(data);
    renderStageChart(data);
    renderMonthlyChart(data);
  }

  function renderSectorChart(data) {
    const canvas = findElement(
      "#sectorChart",
      "#salesBySectorChart",
      "canvas[data-chart='sector']"
    );

    if (!canvas) {
      return;
    }

    const map = {};

    data.forEach(record => {
      const sector =
        record.sector || "Other";

      map[sector] =
        (map[sector] || 0) +
        record.value;
    });

    const labels = Object.keys(map);
    const values = Object.values(map);

    destroyChart("sector");

    charts.sector =
      new Chart(canvas.getContext("2d"), {
        type: "bar",

        data: {
          labels,

          datasets: [
            {
              label: "Pipeline",
              data: values,
              borderWidth: 1
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            },

            tooltip: {
              callbacks: {
                label: context =>
                  formatCurrency(
                    context.raw
                  )
              }
            }
          },

          scales: {
            y: {
              beginAtZero: true,

              ticks: {
                callback: value =>
                  formatCompactCurrency(
                    value
                  )
              }
            }
          }
        }
      });
  }

  function renderStageChart(data) {
    const canvas = findElement(
      "#stageChart",
      "#salesByStageChart",
      "canvas[data-chart='stage']"
    );

    if (!canvas) {
      return;
    }

    const map = {};

    data.forEach(record => {
      const stage =
        record.stage || "Unknown";

      map[stage] =
        (map[stage] || 0) + record.value;
    });

    destroyChart("stage");

    charts.stage =
      new Chart(canvas.getContext("2d"), {
        type: "doughnut",

        data: {
          labels: Object.keys(map),

          datasets: [
            {
              data: Object.values(map)
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            tooltip: {
              callbacks: {
                label: context => {
                  const label =
                    context.label || "";

                  return (
                    label +
                    ": " +
                    formatCurrency(
                      context.raw
                    )
                  );
                }
              }
            }
          }
        }
      });
  }

  function renderMonthlyChart(data) {
    const canvas = findElement(
      "#monthlyChart",
      "#salesByMonthChart",
      "canvas[data-chart='month']"
    );

    if (!canvas) {
      return;
    }

    const map = {};

    data.forEach(record => {
      const month =
        record.month || "Unknown";

      map[month] =
        (map[month] || 0) +
        record.value;
    });

    const labels = Object.keys(map).sort();

    destroyChart("monthly");

    charts.monthly =
      new Chart(
        canvas.getContext("2d"),
        {
          type: "line",

          data: {
            labels,

            datasets: [
              {
                label: "Pipeline",
                data: labels.map(
                  label => map[label]
                ),
                tension: 0.25,
                fill: false
              }
            ]
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
              tooltip: {
                callbacks: {
                  label: context =>
                    formatCurrency(
                      context.raw
                    )
                }
              }
            },

            scales: {
              y: {
                beginAtZero: true,

                ticks: {
                  callback: value =>
                    formatCompactCurrency(
                      value
                    )
                }
              }
            }
          }
        }
      );
  }

  function destroyChart(name) {
    if (charts[name]) {
      try {
        charts[name].destroy();
      } catch (error) {
        console.warn(
          `Unable to destroy ${name} chart`,
          error
        );
      }

      charts[name] = null;
    }
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */

  function setupNavigation() {
    $all(
      "[data-section-target]"
    ).forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const target =
            button.dataset.sectionTarget;

          if (!target) {
            return;
          }

          showSection(target);

          $all(
            "[data-section-target]"
          ).forEach(item =>
            item.classList.remove(
              "active"
            )
          );

          button.classList.add("active");
        }
      );
    });

    $all(
      "[data-nav-target]"
    ).forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const target =
            button.dataset.navTarget;

          showSection(target);
        }
      );
    });
  }

  function showSection(id) {
    const section =
      document.getElementById(id);

    if (!section) {
      return;
    }

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* ============================================================
     BUTTONS
     ============================================================ */

  function setupButtons() {
    $all(
      "[data-action='refresh'], #refreshData, #refreshButton"
    ).forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          await loadDashboardData();
        }
      );
    });

    $all(
      "[data-action='reset'], #resetFilters, #clearFilters"
    ).forEach(button => {
      button.addEventListener(
        "click",
        resetFilters
      );
    });

    $all(
      "[data-action='export'], #exportData, #exportCsv"
    ).forEach(button => {
      button.addEventListener(
        "click",
        exportCSV
      );
    });
  }

  /* ============================================================
     EXPORT
     ============================================================ */

  function exportCSV() {
    if (!filteredData.length) {
      alert(
        "There is no data available to export."
      );

      return;
    }

    const headers = [
      "Company",
      "Sector",
      "Value",
      "Stage",
      "Probability",
      "Owner",
      "Month"
    ];

    const rows = filteredData.map(record => [
      record.company,
      record.sector,
      record.value,
      record.stage,
      record.probability,
      record.owner,
      record.month
    ]);

    const csv = [
      headers,
      ...rows
    ]
      .map(row =>
        row
          .map(csvEscape)
          .join(",")
      )
      .join("\r\n");

    const blob =
      new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `Anytime_Diesel_Sales_${formatDateForFile()}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const string =
      value === null ||
      value === undefined
        ? ""
        : String(value);

    if (
      string.includes(",") ||
      string.includes('"') ||
      string.includes("\n")
    ) {
      return (
        '"' +
        string.replace(
          /"/g,
          '""'
        ) +
        '"'
      );
    }

    return string;
  }

  function formatDateForFile() {
    const date = new Date();

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /* ============================================================
     STATUS
     ============================================================ */

  function showLoadingState() {
    const elements = $all(
      "[data-loading], #loading, #loadingState"
    );

    elements.forEach(element => {
      element.style.display = "";
    });
  }

  function hideLoadingState() {
    const elements = $all(
      "[data-loading], #loading, #loadingState"
    );

    elements.forEach(element => {
      element.style.display = "none";
    });
  }

  function showDataStatus(
    message,
    isError = false
  ) {
    const element = findElement(
      "#dataStatus",
      "#statusMessage",
      "[data-data-status]"
    );

    if (!element) {
      return;
    }

    element.textContent = message;

    element.classList.toggle(
      "error",
      isError
    );

    element.classList.toggle(
      "success",
      !isError
    );
  }

  function updateResultCount(count) {
    $all(
      "#resultCount, #recordCount, [data-result-count]"
    ).forEach(element => {
      element.textContent =
        Number(count || 0).toLocaleString(
          "en-IN"
        );
    });
  }

  /* ============================================================
     EMPTY / ERROR STATES
     ============================================================ */

  function renderEmptyState(message) {
    const containers = [
      findElement(
        "#topOpportunities",
        "#opportunityList",
        "#topOpportunityList"
      ),

      findElement(
        "#salesTableBody",
        "#opportunitiesTableBody",
        "#dataTableBody"
      )
    ].filter(Boolean);

    containers.forEach(container => {
      container.innerHTML =
        emptyMessage(
          message ||
            "No dashboard data available."
        );
    });

    setText(
      [
        "#totalPipeline",
        "#pipelineValue",
        "[data-kpi='pipeline']"
      ],
      "₹0"
    );

    setText(
      [
        "#weightedPipeline",
        "#weightedValue",
        "[data-kpi='weighted']"
      ],
      "₹0"
    );

    setText(
      [
        "#opportunityCount",
        "#opportunities",
        "[data-kpi='opportunities']"
      ],
      "0"
    );
  }

  function emptyMessage(message) {
    return `
      <div class="empty-state">
        <div class="empty-state-title">
          No data
        </div>

        <div class="empty-state-message">
          ${escapeHTML(message)}
        </div>
      </div>
    `;
  }

  /* ============================================================
     STAGE HELPERS
     ============================================================ */

  function normalizeStage(stage) {
    return cleanString(stage)
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stageClass(stage) {
    const normalized =
      normalizeStage(stage);

    if (
      normalized.includes("won") ||
      normalized.includes("closed")
    ) {
      return "stage-won";
    }

    if (
      normalized.includes("lost") ||
      normalized.includes("closed lost")
    ) {
      return "stage-lost";
    }

    if (
      normalized.includes("negotiation")
    ) {
      return "stage-negotiation";
    }

    if (
      normalized.includes("proposal")
    ) {
      return "stage-proposal";
    }

    if (
      normalized.includes("qualified")
    ) {
      return "stage-qualified";
    }

    if (
      normalized.includes("lead")
    ) {
      return "stage-lead";
    }

    return "stage-default";
  }

  /* ============================================================
     SECURITY
     ============================================================ */

  function escapeHTML(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ============================================================
     GLOBAL DASHBOARD API
     ============================================================ */

  window.AnytimeDieselDashboard = {
    refresh: loadDashboardData,

    getData: () => [...salesData],

    getFilteredData: () => [
      ...filteredData
    ],

    resetFilters,

    exportCSV,

    applyFilters,

    setFilter(name, value) {
      if (
        Object.prototype.hasOwnProperty.call(
          currentFilters,
          name
        )
      ) {
        currentFilters[name] = value;
        applyFilters();
      }
    },

    getMetrics() {
      return calculateMetrics(
        filteredData
      );
    }
  };

})();
