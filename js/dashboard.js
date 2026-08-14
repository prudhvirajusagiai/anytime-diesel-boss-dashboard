/* ============================================================
   ANYTIME DIESEL — BOSS SALES DASHBOARD
   dashboard.js
   Version: 1.0
   Data source: /api/sheets

   Expected Google Sheet columns:
   company, sector, value, stage, probability, owner, month

   This file:
   - Loads data from /api/sheets
   - Parses CSV safely
   - Removes empty / malformed rows
   - Converts numeric fields
   - Calculates dashboard KPIs
   - Exposes cleaned data as window.dashboardData
   - Attempts to update common dashboard elements safely
   - Does NOT expose private CRM information
   ============================================================ */

(function () {
  "use strict";

  /* ==========================================================
     CONFIGURATION
     ========================================================== */

  const CONFIG = {
    API_URL: "/api/sheets",

    // Expected columns from Google Sheets
    REQUIRED_COLUMNS: [
      "company",
      "sector",
      "value",
      "stage",
      "probability",
      "owner",
      "month"
    ],

    // Maximum records displayed in opportunity tables
    MAX_OPPORTUNITIES: 10,

    // Cache duration in milliseconds
    CACHE_DURATION: 60 * 1000
  };


  /* ==========================================================
     GLOBAL STATE
     ========================================================== */

  const state = {
    rawCsv: "",
    data: [],
    filteredData: [],
    loading: false,
    error: null,
    lastUpdated: null
  };


  /* ==========================================================
     PUBLIC GLOBALS
     ========================================================== */

  window.dashboardData = [];
  window.dashboardState = state;


  /* ==========================================================
     DOM HELPERS
     ========================================================== */

  function $(selector) {
    try {
      return document.querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  function $all(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  function setText(selectors, value) {
    const list = Array.isArray(selectors) ? selectors : [selectors];

    list.forEach(function (selector) {
      const element = $(selector);

      if (element) {
        element.textContent = value;
      }
    });
  }

  function setHTML(selectors, html) {
    const list = Array.isArray(selectors) ? selectors : [selectors];

    list.forEach(function (selector) {
      const element = $(selector);

      if (element) {
        element.innerHTML = html;
      }
    });
  }


  /* ==========================================================
     SECURITY / HTML ESCAPING
     ========================================================== */

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  /* ==========================================================
     NUMBER HELPERS
     ========================================================== */

  function parseNumber(value) {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    let text = String(value).trim();

    if (!text) {
      return 0;
    }

    // Remove currency symbols, commas and spaces
    text = text
      .replace(/₹/g, "")
      .replace(/Rs\.?/gi, "")
      .replace(/INR/gi, "")
      .replace(/,/g, "")
      .replace(/\s/g, "")
      .replace(/%/g, "");

    const number = Number(text);

    return Number.isFinite(number) ? number : 0;
  }


  function formatCurrency(value) {
    const number = parseNumber(value);

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(number);
  }


  function formatNumber(value) {
    const number = parseNumber(value);

    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0
    }).format(number);
  }


  function formatPercent(value) {
    const number = parseNumber(value);

    return number.toFixed(0) + "%";
  }


  /* ==========================================================
     CSV PARSER
     ========================================================== */

  function parseCSV(csv) {
    const rows = [];

    if (!csv || typeof csv !== "string") {
      return rows;
    }

    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const character = csv[i];
      const nextCharacter = csv[i + 1];

      if (character === '"') {
        if (insideQuotes && nextCharacter === '"') {
          field += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }

        continue;
      }

      if (character === "," && !insideQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if (
        (character === "\n" || character === "\r") &&
        !insideQuotes
      ) {
        if (character === "\r" && nextCharacter === "\n") {
          i++;
        }

        row.push(field);
        field = "";

        if (
          row.some(function (value) {
            return String(value).trim() !== "";
          })
        ) {
          rows.push(row);
        }

        row = [];
        continue;
      }

      field += character;
    }

    // Final field
    row.push(field);

    if (
      row.some(function (value) {
        return String(value).trim() !== "";
      })
    ) {
      rows.push(row);
    }

    return rows;
  }


  /* ==========================================================
     CSV NORMALIZATION
     ========================================================== */

  function normalizeHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, "")
      .replace(/\s+/g, "_");
  }


  function normalizeRow(headers, row) {
    const object = {};

    headers.forEach(function (header, index) {
      object[header] =
        row[index] !== undefined
          ? String(row[index]).trim()
          : "";
    });

    return object;
  }


  /* ==========================================================
     VALID RECORD CHECK
     ========================================================== */

  function isValidSalesRecord(record) {
    if (!record) {
      return false;
    }

    const company = String(record.company || "").trim();

    // Ignore completely empty rows
    if (!company) {
      return false;
    }

    // Ignore public-note / instruction rows
    const lowerCompany = company.toLowerCase();

    if (
      lowerCompany.includes("public / boss view") ||
      lowerCompany.includes("do not add") ||
      lowerCompany.includes("confidential") ||
      lowerCompany.includes("private crm")
    ) {
      return false;
    }

    // A legitimate record should have at least company
    // and one other useful field.
    const usefulFields = [
      record.sector,
      record.value,
      record.stage,
      record.probability,
      record.owner,
      record.month
    ];

    const usefulCount = usefulFields.filter(function (value) {
      return String(value || "").trim() !== "";
    }).length;

    return usefulCount >= 1;
  }


  /* ==========================================================
     CLEAN CSV DATA
     ========================================================== */

  function cleanCSVData(csv) {
    const rows = parseCSV(csv);

    if (!rows.length) {
      return [];
    }

    const headers = rows[0].map(normalizeHeader);

    const records = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Ignore rows that contain nothing
      if (
        !row ||
        !row.some(function (value) {
          return String(value || "").trim() !== "";
        })
      ) {
        continue;
      }

      const record = normalizeRow(headers, row);

      if (!isValidSalesRecord(record)) {
        continue;
      }

      record.value = parseNumber(record.value);
      record.probability = parseNumber(record.probability);

      record.company = String(record.company || "").trim();
      record.sector = String(record.sector || "").trim();
      record.stage = String(record.stage || "").trim();
      record.owner = String(record.owner || "").trim();
      record.month = String(record.month || "").trim();

      records.push(record);
    }

    return records;
  }


  /* ==========================================================
     FETCH DATA
     ========================================================== */

  async function fetchDashboardData(forceRefresh) {
    if (state.loading) {
      return state.data;
    }

    state.loading = true;
    state.error = null;

    showLoadingState();

    try {
      const response = await fetch(
        CONFIG.API_URL + (forceRefresh ? "?refresh=1" : ""),
        {
          method: "GET",
          headers: {
            Accept: "text/csv,text/plain,*/*"
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          "Google Sheets API returned HTTP " +
          response.status
        );
      }

      const csv = await response.text();

      if (!csv || !csv.trim()) {
        throw new Error("The Google Sheets response is empty.");
      }

      state.rawCsv = csv;

      const records = cleanCSVData(csv);

      state.data = records;
      state.filteredData = records.slice();
      state.lastUpdated = new Date();

      window.dashboardData = records;

      hideLoadingState();

      updateDashboard(records);

      return records;
    } catch (error) {
      console.error(
        "Anytime Diesel dashboard data error:",
        error
      );

      state.error = error;

      showErrorState(error);

      return [];
    } finally {
      state.loading = false;
    }
  }


  /* ==========================================================
     KPI CALCULATIONS
     ========================================================== */

  function calculateKPIs(data) {
    const records = Array.isArray(data) ? data : [];

    const totalPipeline = records.reduce(function (sum, record) {
      return sum + parseNumber(record.value);
    }, 0);

    const weightedPipeline = records.reduce(function (
      sum,
      record
    ) {
      const value = parseNumber(record.value);
      const probability = parseNumber(record.probability);

      return sum + value * (probability / 100);
    }, 0);

    const averageProbability =
      records.length > 0
        ? records.reduce(function (sum, record) {
            return sum + parseNumber(record.probability);
          }, 0) / records.length
        : 0;

    const openOpportunities = records.length;

    const wonRecords = records.filter(function (record) {
      return String(record.stage || "")
        .toLowerCase()
        .includes("won");
    });

    const lostRecords = records.filter(function (record) {
      return String(record.stage || "")
        .toLowerCase()
        .includes("lost");
    });

    const wonValue = wonRecords.reduce(function (
      sum,
      record
    ) {
      return sum + parseNumber(record.value);
    }, 0);

    const lostValue = lostRecords.reduce(function (
      sum,
      record
    ) {
      return sum + parseNumber(record.value);
    }, 0);

    return {
      totalPipeline: totalPipeline,
      weightedPipeline: weightedPipeline,
      averageProbability: averageProbability,
      openOpportunities: openOpportunities,
      wonCount: wonRecords.length,
      lostCount: lostRecords.length,
      wonValue: wonValue,
      lostValue: lostValue
    };
  }


  /* ==========================================================
     GROUPING FUNCTIONS
     ========================================================== */

  function groupBy(data, field) {
    const groups = {};

    data.forEach(function (record) {
      const key =
        String(record[field] || "Unspecified").trim() ||
        "Unspecified";

      if (!groups[key]) {
        groups[key] = {
          name: key,
          count: 0,
          value: 0,
          weightedValue: 0
        };
      }

      groups[key].count += 1;

      groups[key].value += parseNumber(record.value);

      groups[key].weightedValue +=
        parseNumber(record.value) *
        (parseNumber(record.probability) / 100);
    });

    return Object.values(groups).sort(function (a, b) {
      return b.value - a.value;
    });
  }


  function getStageSummary(data) {
    return groupBy(data, "stage");
  }


  function getSectorSummary(data) {
    return groupBy(data, "sector");
  }


  function getOwnerSummary(data) {
    return groupBy(data, "owner");
  }


  /* ==========================================================
     TOP OPPORTUNITIES
     ========================================================== */

  function getTopOpportunities(data) {
    return data
      .slice()
      .sort(function (a, b) {
        const valueDifference =
          parseNumber(b.value) - parseNumber(a.value);

        if (valueDifference !== 0) {
          return valueDifference;
        }

        return (
          parseNumber(b.probability) -
          parseNumber(a.probability)
        );
      })
      .slice(0, CONFIG.MAX_OPPORTUNITIES);
  }


  /* ==========================================================
     UPDATE DASHBOARD
     ========================================================== */

  function updateDashboard(data) {
    const records = Array.isArray(data) ? data : [];

    const kpis = calculateKPIs(records);

    updateKPICards(kpis);

    updateOpportunityTables(records);

    updateSummaryLists(records);

    updateCharts(records);

    updateRecordCount(records);

    updateLastUpdated();

    document.dispatchEvent(
      new CustomEvent("anytimeDieselDataLoaded", {
        detail: {
          data: records,
          kpis: kpis
        }
      })
    );
  }


  /* ==========================================================
     KPI CARD UPDATE
     ========================================================== */

  function updateKPICards(kpis) {
    const currencyValues = [
      kpis.totalPipeline,
      kpis.weightedPipeline,
      kpis.wonValue,
      kpis.lostValue
    ];

    // Common IDs
    setText(
      [
        "#totalPipeline",
        "#total-pipeline",
        "#pipelineValue",
        "#pipeline-value",
        "[data-kpi='total-pipeline']"
      ],
      formatCurrency(currencyValues[0])
    );

    setText(
      [
        "#weightedPipeline",
        "#weighted-pipeline",
        "#weightedValue",
        "#weighted-value",
        "[data-kpi='weighted-pipeline']"
      ],
      formatCurrency(currencyValues[1])
    );

    setText(
      [
        "#openOpportunities",
        "#open-opportunities",
        "#opportunityCount",
        "#opportunity-count",
        "[data-kpi='open-opportunities']"
      ],
      formatNumber(kpis.openOpportunities)
    );

    setText(
      [
        "#averageProbability",
        "#average-probability",
        "#avgProbability",
        "#avg-probability",
        "[data-kpi='average-probability']"
      ],
      formatPercent(kpis.averageProbability)
    );

    setText(
      [
        "#wonValue",
        "#won-value",
        "[data-kpi='won-value']"
      ],
      formatCurrency(kpis.wonValue)
    );

    setText(
      [
        "#lostValue",
        "#lost-value",
        "[data-kpi='lost-value']"
      ],
      formatCurrency(kpis.lostValue)
    );

    setText(
      [
        "#wonCount",
        "#won-count",
        "[data-kpi='won-count']"
      ],
      formatNumber(kpis.wonCount)
    );

    setText(
      [
        "#lostCount",
        "#lost-count",
        "[data-kpi='lost-count']"
      ],
      formatNumber(kpis.lostCount)
    );
  }


  /* ==========================================================
     OPPORTUNITY TABLES
     ========================================================== */

  function updateOpportunityTables(data) {
    const opportunities = getTopOpportunities(data);

    const tableSelectors = [
      "#topOpportunities",
      "#top-opportunities",
      "#opportunitiesTableBody",
      "#opportunities-table-body",
      "[data-table='top-opportunities']"
    ];

    const html = opportunities
      .map(function (record) {
        return `
          <tr>
            <td>${escapeHTML(record.company)}</td>
            <td>${escapeHTML(record.sector)}</td>
            <td>${formatCurrency(record.value)}</td>
            <td>${escapeHTML(record.stage)}</td>
            <td>${formatPercent(record.probability)}</td>
            <td>${escapeHTML(record.owner)}</td>
            <td>${escapeHTML(record.month)}</td>
          </tr>
        `;
      })
      .join("");

    tableSelectors.forEach(function (selector) {
      const element = $(selector);

      if (!element) {
        return;
      }

      if (element.tagName === "TBODY") {
        element.innerHTML = html;
        return;
      }

      const tbody = element.querySelector("tbody");

      if (tbody) {
        tbody.innerHTML = html;
      } else {
        element.innerHTML = html;
      }
    });
  }


  /* ==========================================================
     SUMMARY LISTS
     ========================================================== */

  function updateSummaryLists(data) {
    const stageSummary = getStageSummary(data);
    const sectorSummary = getSectorSummary(data);
    const ownerSummary = getOwnerSummary(data);

    renderSummaryList(
      [
        "#pipelineByStage",
        "#pipeline-by-stage",
        "[data-summary='stage']"
      ],
      stageSummary
    );

    renderSummaryList(
      [
        "#pipelineBySector",
        "#pipeline-by-sector",
        "[data-summary='sector']"
      ],
      sectorSummary
    );

    renderSummaryList(
      [
        "#pipelineByOwner",
        "#pipeline-by-owner",
        "[data-summary='owner']"
      ],
      ownerSummary
    );
  }


  function renderSummaryList(selectors, groups) {
    const html = groups
      .map(function (group) {
        return `
          <div class="summary-row">
            <div class="summary-row-main">
              <span class="summary-name">
                ${escapeHTML(group.name)}
              </span>

              <span class="summary-count">
                ${formatNumber(group.count)}
              </span>
            </div>

            <div class="summary-row-value">
              ${formatCurrency(group.value)}
            </div>
          </div>
        `;
      })
      .join("");

    selectors.forEach(function (selector) {
      const element = $(selector);

      if (element) {
        element.innerHTML =
          html ||
          `<div class="empty-state">No data available</div>`;
      }
    });
  }


  /* ==========================================================
     CHART SUPPORT
     ========================================================== */

  function updateCharts(data) {
    const stageSummary = getStageSummary(data);
    const sectorSummary = getSectorSummary(data);

    /*
     * If Chart.js is already included in index.html,
     * update charts when matching canvas IDs exist.
     */

    if (
      window.Chart &&
      $("#pipelineByStageChart")
    ) {
      createOrUpdateChart(
        "pipelineByStageChart",
        "bar",
        stageSummary.map(function (item) {
          return item.name;
        }),
        stageSummary.map(function (item) {
          return item.value;
        })
      );
    }

    if (
      window.Chart &&
      $("#pipelineBySectorChart")
    ) {
      createOrUpdateChart(
        "pipelineBySectorChart",
        "doughnut",
        sectorSummary.map(function (item) {
          return item.name;
        }),
        sectorSummary.map(function (item) {
          return item.value;
        })
      );
    }
  }


  const chartInstances = {};


  function createOrUpdateChart(
    canvasId,
    type,
    labels,
    values
  ) {
    const canvas = document.getElementById(canvasId);

    if (!canvas || !window.Chart) {
      return;
    }

    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(canvas, {
      type: type,

      data: {
        labels: labels,

        datasets: [
          {
            label: "Pipeline Value",
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
            display: type === "doughnut"
          },

          tooltip: {
            callbacks: {
              label: function (context) {
                return (
                  " " +
                  formatCurrency(context.raw)
                );
              }
            }
          }
        },

        scales:
          type === "doughnut"
            ? {}
            : {
                y: {
                  beginAtZero: true,

                  ticks: {
                    callback: function (value) {
                      return formatCurrency(value);
                    }
                  }
                }
              }
      }
    });
  }


  /* ==========================================================
     RECORD COUNT
     ========================================================== */

  function updateRecordCount(data) {
    const count = Array.isArray(data)
      ? data.length
      : 0;

    setText(
      [
        "#recordCount",
        "#record-count",
        "#dataCount",
        "#data-count",
        "[data-record-count]"
      ],
      formatNumber(count)
    );
  }


  /* ==========================================================
     LAST UPDATED
     ========================================================== */

  function updateLastUpdated() {
    if (!state.lastUpdated) {
      return;
    }

    const time = state.lastUpdated.toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );

    setText(
      [
        "#lastUpdated",
        "#last-updated",
        "#dataLastUpdated",
        "#data-last-updated",
        "[data-last-updated]"
      ],
      "Updated " + time
    );
  }


  /* ==========================================================
     LOADING STATE
     ========================================================== */

  function showLoadingState() {
    setText(
      [
        "#dataStatus",
        "#data-status",
        "[data-status]"
      ],
      "Loading sales data..."
    );

    $all(
      "[data-loading], .data-loading"
    ).forEach(function (element) {
      element.style.display = "";
    });
  }


  function hideLoadingState() {
    $all(
      "[data-loading], .data-loading"
    ).forEach(function (element) {
      element.style.display = "none";
    });

    setText(
      [
        "#dataStatus",
        "#data-status",
        "[data-status]"
      ],
      "Live"
    );
  }


  /* ==========================================================
     ERROR STATE
     ========================================================== */

  function showErrorState(error) {
    console.error(error);

    const message =
      error && error.message
        ? error.message
        : "Unable to load sales data.";

    setText(
      [
        "#dataStatus",
        "#data-status",
        "[data-status]"
      ],
      "Data unavailable"
    );

    const errorElements = [
      "#dataError",
      "#data-error",
      "[data-error]"
    ];

    errorElements.forEach(function (selector) {
      const element = $(selector);

      if (!element) {
        return;
      }

      element.textContent =
        "Unable to load Google Sheets data: " +
        message;

      element.style.display = "";
    });
  }


  /* ==========================================================
     SEARCH
     ========================================================== */

  function searchData(searchTerm) {
    const term = String(searchTerm || "")
      .trim()
      .toLowerCase();

    if (!term) {
      state.filteredData = state.data.slice();

      updateDashboard(state.filteredData);

      return state.filteredData;
    }

    state.filteredData = state.data.filter(
      function (record) {
        return Object.values(record).some(
          function (value) {
            return String(value || "")
              .toLowerCase()
              .includes(term);
          }
        );
      }
    );

    updateDashboard(state.filteredData);

    return state.filteredData;
  }


  /* ==========================================================
     FILTER BY STAGE
     ========================================================== */

  function filterByStage(stage) {
    const value = String(stage || "")
      .trim()
      .toLowerCase();

    if (!value || value === "all") {
      state.filteredData = state.data.slice();
    } else {
      state.filteredData = state.data.filter(
        function (record) {
          return String(record.stage || "")
            .trim()
            .toLowerCase() === value;
        }
      );
    }

    updateDashboard(state.filteredData);

    return state.filteredData;
  }


  /* ==========================================================
     FILTER BY SECTOR
     ========================================================== */

  function filterBySector(sector) {
    const value = String(sector || "")
      .trim()
      .toLowerCase();

    if (!value || value === "all") {
      state.filteredData = state.data.slice();
    } else {
      state.filteredData = state.data.filter(
        function (record) {
          return String(record.sector || "")
            .trim()
            .toLowerCase() === value;
        }
      );
    }

    updateDashboard(state.filteredData);

    return state.filteredData;
  }


  /* ==========================================================
     RESET FILTERS
     ========================================================== */

  function resetFilters() {
    state.filteredData = state.data.slice();

    updateDashboard(state.filteredData);

    $all(
      "input[data-dashboard-search], #dashboardSearch, #search"
    ).forEach(function (input) {
      input.value = "";
    });

    $all(
      "select[data-dashboard-filter]"
    ).forEach(function (select) {
      select.value = "all";
    });

    return state.filteredData;
  }


  /* ==========================================================
     EVENT LISTENERS
     ========================================================== */

  function setupEventListeners() {
    /*
     * Search inputs
     */

    $all(
      [
        "#dashboardSearch",
        "#dashboard-search",
        "#search",
        "[data-dashboard-search]"
      ].join(",")
    ).forEach(function (input) {
      input.addEventListener(
        "input",
        function (event) {
          searchData(event.target.value);
        }
      );
    });


    /*
     * Stage filters
     */

    $all(
      [
        "#stageFilter",
        "#stage-filter",
        "[data-filter-stage]"
      ].join(",")
    ).forEach(function (element) {
      element.addEventListener(
        "change",
        function (event) {
          filterByStage(event.target.value);
        }
      );
    });


    /*
     * Sector filters
     */

    $all(
      [
        "#sectorFilter",
        "#sector-filter",
        "[data-filter-sector]"
      ].join(",")
    ).forEach(function (element) {
      element.addEventListener(
        "change",
        function (event) {
          filterBySector(event.target.value);
        }
      );
    });


    /*
     * Refresh buttons
     */

    $all(
      [
        "#refreshData",
        "#refresh-data",
        "[data-refresh-data]"
      ].join(",")
    ).forEach(function (button) {
      button.addEventListener(
        "click",
        async function () {
          await fetchDashboardData(true);
        }
      );
    });


    /*
     * Reset filters
     */

    $all(
      [
        "#resetFilters",
        "#reset-filters",
        "[data-reset-filters]"
      ].join(",")
    ).forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          resetFilters();
        }
      );
    });
  }


  /* ==========================================================
     AUTO-REFRESH
     ========================================================== */

  function startAutoRefresh() {
    setInterval(
      function () {
        fetchDashboardData(true);
      },
      5 * 60 * 1000
    );
  }


  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  async function initializeDashboard() {
    console.log(
      "Anytime Diesel BOSS Dashboard initializing..."
    );

    setupEventListeners();

    await fetchDashboardData(false);

    startAutoRefresh();

    console.log(
      "Anytime Diesel BOSS Dashboard initialized."
    );
  }


  /* ==========================================================
     PUBLIC API
     ========================================================== */

  window.AnytimeDieselDashboard = {
    load: fetchDashboardData,

    refresh: function () {
      return fetchDashboardData(true);
    },

    search: searchData,

    filterStage: filterByStage,

    filterSector: filterBySector,

    resetFilters: resetFilters,

    getData: function () {
      return state.data.slice();
    },

    getFilteredData: function () {
      return state.filteredData.slice();
    },

    getKPIs: function () {
      return calculateKPIs(state.data);
    },

    getStageSummary: function () {
      return getStageSummary(state.data);
    },

    getSectorSummary: function () {
      return getSectorSummary(state.data);
    },

    getOwnerSummary: function () {
      return getOwnerSummary(state.data);
    }
  };


  /* ==========================================================
     START
     ========================================================== */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializeDashboard
    );
  } else {
    initializeDashboard();
  }

})();
