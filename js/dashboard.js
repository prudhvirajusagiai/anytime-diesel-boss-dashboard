let allData = [];

let filteredData = [];

let headers = [];



/* ---------------------------------------
   HELPERS
--------------------------------------- */


function normalize(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

}


function money(value) {

    const number =
        parseFloat(
            String(value || "")
                .replace(/,/g, "")
                .replace(/[₹$]/g, "")
        ) || 0;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(number);

}


function number(value) {

    return new Intl.NumberFormat("en-IN")
        .format(
            parseFloat(
                String(value || "")
                    .replace(/,/g, "")
            ) || 0
        );

}


function findColumn(names) {

    for (const name of names) {

        const target = normalize(name);

        const index =
            headers.findIndex(
                h => normalize(h) === target
            );

        if (index !== -1) {

            return headers[index];

        }

    }

    return null;

}


function getValue(row, names) {

    const column =
        findColumn(names);

    if (!column) return "";

    return row[column] || "";

}


function dateValue(value) {

    if (!value) return null;

    const date =
        new Date(value);

    if (isNaN(date.getTime())) {

        return null;

    }

    return date;

}


function formatDate(value) {

    const date =
        dateValue(value);

    if (!date) return value || "—";

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function today() {

    const date = new Date();

    date.setHours(0,0,0,0);

    return date;

}


function isToday(value) {

    const date =
        dateValue(value);

    if (!date) return false;

    date.setHours(0,0,0,0);

    return date.getTime() === today().getTime();

}


function isPast(value) {

    const date =
        dateValue(value);

    if (!date) return false;

    date.setHours(0,0,0,0);

    return date < today();

}


function csvParse(text) {

    const rows = [];

    let row = [];

    let cell = "";

    let quoted = false;


    for (let i = 0; i < text.length; i++) {

        const char = text[i];

        const next = text[i + 1];


        if (char === '"' && quoted && next === '"') {

            cell += '"';

            i++;

            continue;

        }


        if (char === '"') {

            quoted = !quoted;

            continue;

        }


        if (char === "," && !quoted) {

            row.push(cell);

            cell = "";

            continue;

        }


        if (
            (char === "\n" || char === "\r") &&
            !quoted
        ) {

            if (char === "\r" && next === "\n") {

                i++;

            }

            row.push(cell);

            cell = "";

            if (row.some(v => v.trim() !== "")) {

                rows.push(row);

            }

            row = [];

            continue;

        }


        cell += char;

    }


    if (cell.length || row.length) {

        row.push(cell);

        if (row.some(v => v.trim() !== "")) {

            rows.push(row);

        }

    }


    if (!rows.length) {

        return [];

    }


    const headerRow =
        rows.shift().map(v => v.trim());


    return rows.map(values => {

        const object = {};

        headerRow.forEach(
            (header, index) => {

                object[header] =
                    (values[index] || "").trim();

            }
        );

        return object;

    });

}


/* ---------------------------------------
   DATA LOAD
--------------------------------------- */


async function loadData() {

    setConnection(
        false,
        "Connecting..."
    );


    try {

        const response =
            await fetch(
                "/api/sheets?ts=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const text =
            await response.text();


        if (
            !text ||
            text.trim().length < 5
        ) {

            throw new Error(
                "Google Sheet returned no usable data."
            );

        }


        const data =
            csvParse(text);


        if (!data.length) {

            throw new Error(
                "No rows found in Google Sheet."
            );

        }


        allData = data;

        filteredData = [...allData];

        headers =
            Object.keys(
                allData[0]
            );


        setConnection(
            true,
            "Google Sheets Connected"
        );


        hideAlert();

        populateFilters();

        renderDashboard();

        updateTime();


    } catch (error) {

        console.error(error);

        setConnection(
            false,
            "Connection Error"
        );


        showAlert(
            error.message
        );

    }

}


/* ---------------------------------------
   CONNECTION
--------------------------------------- */


function setConnection(
    online,
    text
) {

    const dot =
        document.getElementById(
            "connectionDot"
        );

    const label =
        document.getElementById(
            "connectionText"
        );


    dot.className =
        "status-dot " +
        (online ? "online" : "offline");


    label.textContent =
        text;

}


function showAlert(message) {

    document
        .getElementById("alertBox")
        .classList.remove("hidden");


    document
        .getElementById("alertMessage")
        .textContent =
        message;

}


function hideAlert() {

    document
        .getElementById("alertBox")
        .classList.add("hidden");

}


/* ---------------------------------------
   FILTERS
--------------------------------------- */


function populateFilters() {

    populateSelect(
        "monthFilter",
        [
            "date",
            "follow-up date",
            "next follow-up",
            "invoice date"
        ]
    );


    populateSelect(
        "sectorFilter",
        [
            "sector",
            "industry",
            "customer sector"
        ]
    );


    populateSelect(
        "productFilter",
        [
            "product",
            "product/service",
            "service"
        ]
    );

}


function populateSelect(
    elementId,
    possibleColumns
) {

    const element =
        document.getElementById(
            elementId
        );


    if (!element) return;


    const column =
        findColumn(
            possibleColumns
        );


    if (!column) return;


    const values =
        [
            ...new Set(
                allData
                    .map(row =>
                        row[column]
                    )
                    .filter(Boolean)
            )
        ]
        .sort();


    element.innerHTML =
        `<option value="all">All</option>`;


    values.forEach(value => {

        const option =
            document.createElement(
                "option"
            );

        option.value = value;

        option.textContent = value;

        element.appendChild(
            option
        );

    });

}


function applyFilters() {

    const month =
        document.getElementById(
            "monthFilter"
        ).value;


    const sector =
        document.getElementById(
            "sectorFilter"
        ).value;


    const product =
        document.getElementById(
            "productFilter"
        ).value;


    const search =
        normalize(
            document.getElementById(
                "searchFilter"
            ).value
        );


    filteredData =
        allData.filter(row => {


            const rowSector =
                getValue(
                    row,
                    [
                        "sector",
                        "industry",
                        "customer sector"
                    ]
                );


            const rowProduct =
                getValue(
                    row,
                    [
                        "product",
                        "product/service",
                        "service"
                    ]
                );


            const rowDate =
                getValue(
                    row,
                    [
                        "date",
                        "follow-up date",
                        "next follow-up"
                    ]
                );


            if (
                sector !== "all" &&
                rowSector !== sector
            ) {

                return false;

            }


            if (
                product !== "all" &&
                rowProduct !== product
            ) {

                return false;

            }


            if (
                month !== "all" &&
                rowDate &&
                new Date(rowDate)
                    .toLocaleString(
                        "en-IN",
                        {
                            month: "long"
                        }
                    ) !== month
            ) {

                return false;

            }


            if (search) {

                const searchable =
                    Object.values(row)
                        .join(" ")
                        .toLowerCase();


                if (
                    !searchable.includes(
                        search
                    )
                ) {

                    return false;

                }

            }


            return true;

        });


    renderDashboard();

}


/* ---------------------------------------
   MAIN RENDER
--------------------------------------- */


function renderDashboard() {

    renderKPIs();

    renderSalesChart();

    renderPipelineChart();

    renderTodayFollowups();

    renderUpcomingSchedule();

    renderPaymentAlerts();

    renderProspects();

    renderFollowups();

    renderSchedule();

    renderClients();

    renderPayments();

    renderTargets();

    renderProducts();

    renderAchievements();

    renderReports();

}


/* ---------------------------------------
   KPI
--------------------------------------- */


function renderKPIs() {

    let target = 0;

    let sales = 0;

    let pipeline = 0;

    let prospects = 0;

    let followups = 0;

    let clients = 0;

    let payments = 0;


    filteredData.forEach(row => {

        target += parseMoney(
            getValue(
                row,
                [
                    "target",
                    "monthly target",
                    "sales target"
                ]
            )
        );


        sales += parseMoney(
            getValue(
                row,
                [
                    "sales",
                    "achieved sales",
                    "revenue",
                    "sales value",
                    "order value",
                    "closed value"
                ]
            )
        );


        pipeline += parseMoney(
            getValue(
                row,
                [
                    "pipeline",
                    "pipeline value",
                    "opportunity value",
                    "deal value"
                ]
            )
        );


        const type =
            normalize(
                getValue(
                    row,
                    [
                        "type",
                        "lead type",
                        "record type"
                    ]
                )
            );


        const status =
            normalize(
                getValue(
                    row,
                    [
                        "status",
                        "lead status",
                        "customer status"
                    ]
                )
            );


        if (
            type.includes("prospect") ||
            type.includes("lead") ||
            status.includes("prospect") ||
            status.includes("lead")
        ) {

            prospects++;

        }


        const followupDate =
            getValue(
                row,
                [
                    "next follow-up",
                    "follow-up date",
                    "followup date"
                ]
            );


        if (
            followupDate &&
            (
                isToday(followupDate) ||
                isPast(followupDate)
            )
        ) {

            followups++;

        }


        if (
            type.includes("client") ||
            type.includes("customer") ||
            status.includes("active")
        ) {

            clients++;

        }


        const paymentStatus =
            normalize(
                getValue(
                    row,
                    [
                        "payment status",
                        "invoice status"
                    ]
                )
            );


        if (
            paymentStatus.includes("pending") ||
            paymentStatus.includes("overdue") ||
            paymentStatus.includes("outstanding")
        ) {

            payments++;

        }

    });


    const achievement =
        target > 0
            ? (sales / target) * 100
            : 0;


    document.getElementById(
        "kpiTarget"
    ).textContent =
        money(target);


    document.getElementById(
        "kpiSales"
    ).textContent =
        money(sales);


    document.getElementById(
        "kpiAchievement"
    ).textContent =
        achievement.toFixed(1) + "%";


    document.getElementById(
        "achievementProgress"
    ).style.width =
        Math.min(
            achievement,
            100
        ) + "%";


    document.getElementById(
        "kpiPipeline"
    ).textContent =
        money(pipeline);


    document.getElementById(
        "kpiProspects"
    ).textContent =
        number(prospects);


    document.getElementById(
        "kpiFollowups"
    ).textContent =
        number(followups);


    document.getElementById(
        "kpiClients"
    ).textContent =
        number(clients);


    document.getElementById(
        "kpiPayments"
    ).textContent =
        number(payments);

}


function parseMoney(value) {

    return (
        parseFloat(
            String(value || "")
                .replace(/,/g, "")
                .replace(/[₹$]/g, "")
                .replace(/%/g, "")
        ) || 0
    );

}


/* ---------------------------------------
   SALES CHART
--------------------------------------- */


function renderSalesChart() {

    const target =
        filteredData.reduce(
            (sum, row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "target",
                            "monthly target",
                            "sales target"
                        ]
                    )
                ),
            0
        );


    const sales =
        filteredData.reduce(
            (sum, row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "sales",
                            "achieved sales",
                            "revenue",
                            "sales value",
                            "order value"
                        ]
                    )
                ),
            0
        );


    const max =
        Math.max(
            target,
            sales,
            1
        );


    document.getElementById(
        "salesChart"
    ).innerHTML = `

        <div class="chart-bar">

            <div class="chart-bar-value">
                ${money(target)}
            </div>

            <div
                class="chart-bar-fill"
                style="height:${Math.max(
                    10,
                    (target / max) * 160
                )}px"
            ></div>

            <div class="chart-bar-label">
                Target
            </div>

        </div>


        <div class="chart-bar">

            <div class="chart-bar-value">
                ${money(sales)}
            </div>

            <div
                class="chart-bar-fill"
                style="height:${Math.max(
                    10,
                    (sales / max) * 160
                )}px"
            ></div>

            <div class="chart-bar-label">
                Achieved
            </div>

        </div>

    `;

}


/* ---------------------------------------
   PIPELINE
--------------------------------------- */


function renderPipelineChart() {

    const stages = {};

    filteredData.forEach(row => {

        const stage =
            getValue(
                row,
                [
                    "stage",
                    "pipeline stage",
                    "sales stage",
                    "status"
                ]
            ) || "Unspecified";


        const value =
            parseMoney(
                getValue(
                    row,
                    [
                        "pipeline value",
                        "opportunity value",
                        "deal value",
                        "pipeline"
                    ]
                )
            );


        stages[stage] =
            (stages[stage] || 0) +
            value;

    });


    const entries =
        Object.entries(stages)
            .sort(
                (a,b) =>
                    b[1] - a[1]
            )
            .slice(0,6);


    if (!entries.length) {

        document.getElementById(
            "pipelineChart"
        ).innerHTML =
            `<div class="empty">
                No pipeline data available.
            </div>`;

        return;

    }


    const max =
        Math.max(
            ...entries.map(
                x => x[1]
            ),
            1
        );


    document.getElementById(
        "pipelineChart"
    ).innerHTML =
        entries.map(
            ([stage,value]) => `

                <div class="chart-bar">

                    <div class="chart-bar-value">
                        ${money(value)}
                    </div>

                    <div
                        class="chart-bar-fill"
                        style="height:${Math.max(
                            10,
                            value / max * 160
                        )}px"
                    ></div>

                    <div class="chart-bar-label">
                        ${escapeHtml(stage)}
                    </div>

                </div>

            `
        ).join("");

}


/* ---------------------------------------
   FOLLOWUPS
--------------------------------------- */


function renderTodayFollowups() {

    const items =
        filteredData.filter(row => {

            const date =
                getValue(
                    row,
                    [
                        "next follow-up",
                        "follow-up date",
                        "followup date"
                    ]
                );

            return isToday(date);

        }).slice(0,8);


    document.getElementById(
        "todayFollowups"
    ).innerHTML =
        items.length
            ? items.map(row => `

                <div class="list-item">

                    <div class="list-title">
                        ${escapeHtml(
                            getCompany(row)
                        )}
                    </div>

                    <div class="list-meta">
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "contact",
                                    "contact person",
                                    "person"
                                ]
                            )
                        )}
                    </div>

                </div>

            `).join("")
            : `<div class="empty">
                No follow-ups scheduled for today.
            </div>`;

}


function renderUpcomingSchedule() {

    const items =
        filteredData
            .filter(row => {

                const date =
                    getValue(
                        row,
                        [
                            "next follow-up",
                            "follow-up date",
                            "schedule date",
                            "meeting date"
                        ]
                    );

                const d =
                    dateValue(date);

                if (!d) return false;

                d.setHours(0,0,0,0);

                return d >= today();

            })
            .sort(
                (a,b) =>
                    dateValue(
                        getValue(
                            a,
                            [
                                "next follow-up",
                                "follow-up date",
                                "schedule date"
                            ]
                        )
                    ) -
                    dateValue(
                        getValue(
                            b,
                            [
                                "next follow-up",
                                "follow-up date",
                                "schedule date"
                            ]
                        )
                    )
            )
            .slice(0,8);


    document.getElementById(
        "upcomingSchedule"
    ).innerHTML =
        items.length
            ? items.map(row => `

                <div class="list-item">

                    <div class="list-title">
                        ${escapeHtml(
                            getCompany(row)
                        )}
                    </div>

                    <div class="list-meta">
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "next follow-up",
                                    "follow-up date",
                                    "schedule date"
                                ]
                            )
                        )}
                    </div>

                </div>

            `).join("")
            : `<div class="empty">
                No upcoming schedule.
            </div>`;

}


function renderPaymentAlerts() {

    const items =
        filteredData.filter(row => {

            const status =
                normalize(
                    getValue(
                        row,
                        [
                            "payment status",
                            "invoice status"
                        ]
                    )
                );

            return (
                status.includes("pending") ||
                status.includes("overdue") ||
                status.includes("outstanding")
            );

        }).slice(0,8);


    document.getElementById(
        "paymentAlerts"
    ).innerHTML =
        items.length
            ? items.map(row => `

                <div class="list-item">

                    <div class="list-title">
                        ${escapeHtml(
                            getCompany(row)
                        )}
                    </div>

                    <div class="list-meta">
                        ${money(
                            getValue(
                                row,
                                [
                                    "outstanding",
                                    "outstanding amount",
                                    "amount due",
                                    "invoice amount"
                                ]
                            )
                        )}
                    </div>

                </div>

            `).join("")
            : `<div class="empty">
                No payment alerts.
            </div>`;

}


/* ---------------------------------------
   TABLES
--------------------------------------- */


function renderProspects() {

    const rows =
        filteredData
            .filter(row => {

                const status =
                    normalize(
                        getValue(
                            row,
                            [
                                "status",
                                "lead status",
                                "type"
                            ]
                        )
                    );

                return (
                    status.includes("prospect") ||
                    status.includes("lead") ||
                    status.includes("open")
                );

            })
            .slice(0,100);


    document.getElementById(
        "prospectsTable"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <tr>

                    <td>
                        <strong>
                            ${escapeHtml(
                                getCompany(row)
                            )}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "contact",
                                    "contact person"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "sector",
                                    "industry"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "product",
                                    "product/service",
                                    "service"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${statusBadge(
                            getValue(
                                row,
                                [
                                    "stage",
                                    "status"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${money(
                            getValue(
                                row,
                                [
                                    "pipeline value",
                                    "opportunity value",
                                    "deal value"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "next follow-up",
                                    "follow-up date"
                                ]
                            )
                        )}
                    </td>

                </tr>

            `).join("")
            : emptyRow(
                7,
                "No prospect records found."
            );

}


function renderFollowups() {

    const rows =
        filteredData
            .filter(row =>
                getValue(
                    row,
                    [
                        "next follow-up",
                        "follow-up date"
                    ]
                )
            )
            .slice(0,100);


    document.getElementById(
        "followupsTable"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <tr>

                    <td>
                        <strong>
                            ${escapeHtml(
                                getCompany(row)
                            )}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "contact",
                                    "contact person"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "last contact",
                                    "last follow-up"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "next follow-up",
                                    "follow-up date"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${statusBadge(
                            getValue(
                                row,
                                [
                                    "status",
                                    "follow-up status"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "remarks",
                                    "notes",
                                    "comments"
                                ]
                            )
                        )}
                    </td>

                </tr>

            `).join("")
            : emptyRow(
                6,
                "No follow-up records found."
            );

}


function renderClients() {

    const rows =
        filteredData
            .filter(row => {

                const type =
                    normalize(
                        getValue(
                            row,
                            [
                                "type",
                                "record type",
                                "status"
                            ]
                        )
                    );

                return (
                    type.includes("client") ||
                    type.includes("customer") ||
                    type.includes("active")
                );

            })
            .slice(0,100);


    document.getElementById(
        "clientsTable"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <tr>

                    <td>
                        <strong>
                            ${escapeHtml(
                                getCompany(row)
                            )}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "sector",
                                    "industry"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "product",
                                    "service"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${money(
                            getValue(
                                row,
                                [
                                    "monthly business",
                                    "monthly sales",
                                    "monthly value"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "last order",
                                    "last purchase"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${statusBadge(
                            getValue(
                                row,
                                [
                                    "status"
                                ]
                            )
                        )}
                    </td>

                </tr>

            `).join("")
            : emptyRow(
                6,
                "No client records found."
            );

}


function renderPayments() {

    let outstanding = 0;

    let overdue = 0;


    filteredData.forEach(row => {

        const amount =
            parseMoney(
                getValue(
                    row,
                    [
                        "outstanding",
                        "outstanding amount",
                        "amount due",
                        "invoice amount"
                    ]
                )
            );


        outstanding += amount;


        const status =
            normalize(
                getValue(
                    row,
                    [
                        "payment status",
                        "invoice status"
                    ]
                )
            );


        if (
            status.includes("overdue")
        ) {

            overdue += amount;

        }

    });


    document.getElementById(
        "paymentOutstanding"
    ).textContent =
        money(outstanding);


    document.getElementById(
        "paymentOverdue"
    ).textContent =
        money(overdue);


    const rows =
        filteredData.filter(row => {

            const status =
                normalize(
                    getValue(
                        row,
                        [
                            "payment status",
                            "invoice status"
                        ]
                    )
                );

            return (
                status.includes("pending") ||
                status.includes("overdue") ||
                status.includes("outstanding")
            );

        });


    document.getElementById(
        "paymentsTable"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <tr>

                    <td>
                        <strong>
                            ${escapeHtml(
                                getCompany(row)
                            )}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "invoice",
                                    "invoice number"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "invoice date"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "due date"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${money(
                            getValue(
                                row,
                                [
                                    "invoice amount",
                                    "amount due",
                                    "outstanding"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${statusBadge(
                            getValue(
                                row,
                                [
                                    "payment status",
                                    "invoice status"
                                ]
                            )
                        )}
                    </td>

                    <td>
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "payment follow-up",
                                    "next follow-up"
                                ]
                            )
                        )}
                    </td>

                </tr>

            `).join("")
            : emptyRow(
                7,
                "No pending payment records."
            );

}


function renderSchedule() {

    const rows =
        filteredData
            .filter(row =>
                getValue(
                    row,
                    [
                        "schedule date",
                        "meeting date",
                        "next follow-up"
                    ]
                )
            )
            .slice(0,100);


    document.getElementById(
        "scheduleGrid"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <div class="schedule-card">

                    <div class="schedule-date">
                        ${formatDate(
                            getValue(
                                row,
                                [
                                    "schedule date",
                                    "meeting date",
                                    "next follow-up"
                                ]
                            )
                        )}
                    </div>

                    <div class="schedule-title">
                        ${escapeHtml(
                            getCompany(row)
                        )}
                    </div>

                    <div class="schedule-meta">
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "activity",
                                    "meeting type",
                                    "task"
                                ]
                            )
                        )}
                    </div>

                    <div class="schedule-meta">
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "remarks",
                                    "notes"
                                ]
                            )
                        )}
                    </div>

                </div>

            `).join("")
            : `<div class="empty">
                No scheduled activities.
            </div>`;

}


/* ---------------------------------------
   TARGETS
--------------------------------------- */


function renderTargets() {

    const target =
        filteredData.reduce(
            (sum,row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "target",
                            "monthly target",
                            "sales target"
                        ]
                    )
                ),
            0
        );


    const achieved =
        filteredData.reduce(
            (sum,row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "sales",
                            "achieved sales",
                            "revenue",
                            "sales value"
                        ]
                    )
                ),
            0
        );


    const balance =
        Math.max(
            target - achieved,
            0
        );


    document.getElementById(
        "targetSummary"
    ).innerHTML = `

        <div class="target-box">

            <h4>
                Target
            </h4>

            <div class="target-number">
                ${money(target)}
            </div>

        </div>


        <div class="target-box">

            <h4>
                Achieved
            </h4>

            <div class="target-number">
                ${money(achieved)}
            </div>

        </div>


        <div class="target-box">

            <h4>
                Balance
            </h4>

            <div class="target-number">
                ${money(balance)}
            </div>

        </div>

    `;

}


/* ---------------------------------------
   PRODUCTS
--------------------------------------- */


function renderProducts() {

    const products = {};


    filteredData.forEach(row => {

        const product =
            getValue(
                row,
                [
                    "product",
                    "product/service",
                    "service"
                ]
            ) ||
            "Unspecified";


        const value =
            parseMoney(
                getValue(
                    row,
                    [
                        "sales",
                        "sales value",
                        "revenue",
                        "order value"
                    ]
                )
            );


        products[product] =
            (products[product] || 0) +
            value;

    });


    const entries =
        Object.entries(products)
            .sort(
                (a,b) =>
                    b[1] - a[1]
            );


    document.getElementById(
        "productsGrid"
    ).innerHTML =
        entries.length
            ? entries.map(
                ([product,value]) => `

                    <div class="product-card">

                        <h3>
                            ${escapeHtml(
                                product
                            )}
                        </h3>

                        <div class="number">
                            ${money(value)}
                        </div>

                        <div class="kpi-meta">
                            Sales value
                        </div>

                    </div>

                `
            ).join("")
            : `<div class="empty">
                No product data available.
            </div>`;

}


/* ---------------------------------------
   ACHIEVEMENTS
--------------------------------------- */


function renderAchievements() {

    const rows =
        filteredData.filter(row => {

            const achievement =
                getValue(
                    row,
                    [
                        "achievement",
                        "achievement title",
                        "milestone"
                    ]
                );

            return !!achievement;

        });


    document.getElementById(
        "achievementsGrid"
    ).innerHTML =
        rows.length
            ? rows.map(row => `

                <div class="achievement-card">

                    <div class="achievement-icon">
                        🏆
                    </div>

                    <h3>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "achievement",
                                    "achievement title",
                                    "milestone"
                                ]
                            )
                        )}
                    </h3>

                    <p>
                        ${escapeHtml(
                            getValue(
                                row,
                                [
                                    "remarks",
                                    "description",
                                    "notes"
                                ]
                            )
                        )}
                    </p>

                </div>

            `).join("")
            : `

                <div class="achievement-card">

                    <div class="achievement-icon">
                        🏆
                    </div>

                    <h3>
                        Start Building Your Achievement Log
                    </h3>

                    <p>
                        Add achievement records to your Google Sheet
                        to display them here.
                    </p>

                </div>

            `;

}


/* ---------------------------------------
   REPORTS
--------------------------------------- */


function renderReports() {

    renderSectorReport();

    renderProductReport();

    renderManagementSummary();

}


function renderSectorReport() {

    const values = {};


    filteredData.forEach(row => {

        const sector =
            getValue(
                row,
                [
                    "sector",
                    "industry",
                    "customer sector"
                ]
            ) ||
            "Unspecified";


        const sales =
            parseMoney(
                getValue(
                    row,
                    [
                        "sales",
                        "sales value",
                        "revenue",
                        "order value"
                    ]
                )
            );


        values[sector] =
            (values[sector] || 0) +
            sales;

    });


    renderReportRows(
        "sectorReport",
        values
    );

}


function renderProductReport() {

    const values = {};


    filteredData.forEach(row => {

        const product =
            getValue(
                row,
                [
                    "product",
                    "product/service",
                    "service"
                ]
            ) ||
            "Unspecified";


        const sales =
            parseMoney(
                getValue(
                    row,
                    [
                        "sales",
                        "sales value",
                        "revenue",
                        "order value"
                    ]
                )
            );


        values[product] =
            (values[product] || 0) +
            sales;

    });


    renderReportRows(
        "productReport",
        values
    );

}


function renderReportRows(
    elementId,
    values
) {

    const entries =
        Object.entries(values)
            .sort(
                (a,b) =>
                    b[1] - a[1]
            )
            .slice(0,10);


    const max =
        Math.max(
            ...entries.map(
                x => x[1]
            ),
            1
        );


    document.getElementById(
        elementId
    ).innerHTML =
        entries.length
            ? entries.map(
                ([label,value]) => `

                    <div class="report-row">

                        <div class="report-label">
                            ${escapeHtml(label)}
                        </div>

                        <div class="report-track">

                            <div
                                class="report-fill"
                                style="width:${(
                                    value / max * 100
                                )}%"
                            ></div>

                        </div>

                        <div class="report-value">
                            ${money(value)}
                        </div>

                    </div>

                `
            ).join("")
            : `<div class="empty">
                No report data available.
            </div>`;

}


function renderManagementSummary() {

    const sales =
        filteredData.reduce(
            (sum,row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "sales",
                            "sales value",
                            "revenue"
                        ]
                    )
                ),
            0
        );


    const target =
        filteredData.reduce(
            (sum,row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "target",
                            "monthly target"
                        ]
                    )
                ),
            0
        );


    const pipeline =
        filteredData.reduce(
            (sum,row) =>
                sum +
                parseMoney(
                    getValue(
                        row,
                        [
                            "pipeline value",
                            "opportunity value",
                            "deal value"
                        ]
                    )
                ),
            0
        );


    const achievement =
        target > 0
            ? sales / target * 100
            : 0;


    document.getElementById(
        "managementSummary"
    ).innerHTML = `

        <p>
            <strong>Sales Performance:</strong>
            Current recorded sales are
            ${money(sales)}
            against a target of
            ${money(target)},
            representing
            ${achievement.toFixed(1)}%
            achievement.
        </p>

        <p>
            <strong>Pipeline:</strong>
            Current recorded pipeline value is
            ${money(pipeline)}.
        </p>

        <p>
            <strong>Management Focus:</strong>
            Continue prioritising high-value prospects,
            overdue follow-ups, active opportunities and
            pending payment collections.
        </p>

    `;

}


/* ---------------------------------------
   UTILITIES
--------------------------------------- */


function getCompany(row) {

    return getValue(
        row,
        [
            "company",
            "company name",
            "customer",
            "customer name",
            "client",
            "client name",
            "organization",
            "organisation"
        ]
    ) || "Unnamed";

}


function statusBadge(value) {

    const status =
        normalize(value);


    let cls =
        "badge-neutral";


    if (
        status.includes("won") ||
        status.includes("active") ||
        status.includes("completed") ||
        status.includes("paid")
    ) {

        cls =
            "badge-success";

    }


    if (
        status.includes("pending") ||
        status.includes("follow") ||
        status.includes("open") ||
        status.includes("progress")
    ) {

        cls =
            "badge-warning";

    }


    if (
        status.includes("overdue") ||
        status.includes("lost") ||
        status.includes("cancel")
    ) {

        cls =
            "badge-danger";

    }


    return `
        <span class="badge ${cls}">
            ${escapeHtml(
                value || "—"
            )}
        </span>
    `;

}


function emptyRow(
    colspan,
    text
) {

    return `
        <tr>

            <td
                colspan="${colspan}"
                style="text-align:center"
            >

                <span class="empty">
                    ${text}
                </span>

            </td>

        </tr>
    `;

}


function escapeHtml(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function updateTime() {

    document.getElementById(
        "lastUpdated"
    ).textContent =
        new Date().toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );

}


/* ---------------------------------------
   NAVIGATION
--------------------------------------- */


function setupNavigation() {

    document
        .querySelectorAll(
            ".nav-item"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".nav-item"
                        )
                        .forEach(
                            item =>
                                item.classList.remove(
                                    "active"
                                )
                        );


                    button.classList.add(
                        "active"
                    );


                    const section =
                        button.dataset.section;


                    document
                        .querySelectorAll(
                            ".dashboard-section"
                        )
                        .forEach(
                            item =>
                                item.classList.remove(
                                    "active"
                                )
                        );


                    const target =
                        document.getElementById(
                            "section-" +
                            section
                        );


                    if (target) {

                        target.classList.add(
                            "active"
                        );

                    }


                    const titles = {

                        overview:
                            "Sales Dashboard",

                        prospects:
                            "Prospect Management",

                        followups:
                            "Follow-ups",

                        schedule:
                            "Schedule & Reminders",

                        clients:
                            "Existing Clients",

                        payments:
                            "Payment Follow-ups",

                        targets:
                            "Sales Targets",

                        products:
                            "Products & Services",

                        achievements:
                            "Achievements",

                        reports:
                            "Sales Reports"

                    };


                    document.getElementById(
                        "pageTitle"
                    ).textContent =
                        titles[section] ||
                        "Sales Dashboard";

                }

            );

        });

}


/* ---------------------------------------
   INIT
--------------------------------------- */


document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupNavigation();


        document
            .getElementById(
                "refreshButton"
            )
            .addEventListener(
                "click",
                loadData
            );


        document
            .getElementById(
                "monthFilter"
            )
            .addEventListener(
                "change",
                applyFilters
            );


        document
            .getElementById(
                "sectorFilter"
            )
            .addEventListener(
                "change",
                applyFilters
            );


        document
            .getElementById(
                "productFilter"
            )
            .addEventListener(
                "change",
                applyFilters
            );


        document
            .getElementById(
                "searchFilter"
            )
            .addEventListener(
                "input",
                applyFilters
            );


        loadData();

    }
);
