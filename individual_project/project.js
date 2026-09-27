const DATA_URL = "../data/individual_project/occupation_salary_2025.csv";
const SALARY_MIN = 20000;
const SALARY_MAX = 220000;
const RADIUS_REDUCTION = 1 / Math.sqrt(2);
const GROUP_LABELS = {
    "11-0000": "Management",
    "13-0000": "Business & Finance",
    "15-0000": "Computer & Math",
    "17-0000": "Architecture & Engineering",
    "19-0000": "Life & Social Science",
    "21-0000": "Community Service",
    "23-0000": "Legal",
    "25-0000": "Education",
    "27-0000": "Arts & Media",
    "29-0000": "Healthcare Practitioners",
    "31-0000": "Healthcare Support",
    "33-0000": "Protective Service",
    "35-0000": "Food Service",
    "37-0000": "Building & Grounds",
    "39-0000": "Personal Care",
    "41-0000": "Sales",
    "43-0000": "Office Support",
    "45-0000": "Farming & Forestry",
    "47-0000": "Construction",
    "49-0000": "Installation & Repair",
    "51-0000": "Production",
    "53-0000": "Transport"
};
const chartContainer = d3.select("#occupation-chart");
const tooltip = d3.select("#occupation-tooltip");
const searchInput = document.querySelector("#occupation-query");
const searchStatus = document.querySelector("#search-status");
const money = d3.format("$,.0f");
const integer = d3.format(",.0f");
let occupations = [];
let groupOrder = [];
let selectedCode = null;
let selectedGroup = null;
let hoveredCode = null;
let hoveredGroup = null;
let renderedWidth = 0;
let resizeTimer;

const parseNumber = value => value === "" || value == null ? null : +value;
const salaryText = value => value == null ? "Not available" : money(value);
const employmentText = value => value == null ? "Not available" : integer(value);

function hashUnit(value) {
    let hash = 2166136261;
    for (const character of value) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
}

function layoutGroup(group, xScale, salaryScale, radiusScale, groupIndex, aboveTop, aboveBottom) {
    const code = group[0].major_group_code;
    const bandStart = xScale(code);
    const bandEnd = bandStart + xScale.bandwidth();
    const targetX = bandStart + xScale.bandwidth() / 2;
    const nodes = group.map(d => {
        const radius = radiusScale(d.employment || 0);
        const spread = Math.max(1, xScale.bandwidth() / 2 - radius - 1);
        const aboveRange = d.annual_median > SALARY_MAX;
        const upperSpan = Math.max(1, aboveBottom - aboveTop - radius * 2);
        const targetY = aboveRange
            ? aboveTop + radius + hashUnit(`${d.occupation_code}-upper`) * upperSpan
            : salaryScale(d.annual_median);
        return {
            ...d,
            radius,
            x: targetX + (hashUnit(d.occupation_code) - 0.5) * spread * 1.7,
            y: targetY,
            targetX,
            targetY,
            aboveRange
        };
    });
    const constrainX = d => {
        const inset = Math.min(d.radius + 1, xScale.bandwidth() / 2);
        d.x = Math.max(bandStart + inset, Math.min(bandEnd - inset, d.x));
    };
    const regular = nodes.filter(d => !d.aboveRange).sort((a, b) =>
        d3.ascending(a.targetY, b.targetY) || d3.descending(a.radius, b.radius) || d3.ascending(a.occupation_code, b.occupation_code));
    const placed = [];
    regular.forEach(node => {
        const maxOffset = Math.max(0, xScale.bandwidth() / 2 - node.radius - 1);
        const step = 1.5;
        const offsets = [0];
        const side = hashUnit(`${node.occupation_code}-side`) > 0.5 ? 1 : -1;
        for (let offset = step; offset <= maxOffset; offset += step) offsets.push(side * offset, -side * offset);
        let bestX = targetX;
        let bestPenalty = Infinity;
        offsets.forEach(offset => {
            const candidateX = targetX + offset;
            let penalty = Math.abs(offset) * 0.002;
            placed.forEach(other => {
                const separation = node.radius + other.radius + 0.9;
                const dy = node.targetY - other.targetY;
                if (Math.abs(dy) >= separation) return;
                const distance = Math.hypot(candidateX - other.x, dy);
                if (distance < separation) penalty += (separation - distance) ** 2;
            });
            if (penalty < bestPenalty) {
                bestPenalty = penalty;
                bestX = candidateX;
            }
        });
        node.x = bestX;
        node.y = node.targetY;
        constrainX(node);
        placed.push(node);
    });
    if (regular.length > 1) {
        const simulation = d3.forceSimulation(regular)
            .randomSource(d3.randomLcg(0.27 + groupIndex / 100))
            .velocityDecay(0.36)
            .force("x", d3.forceX(targetX).strength(0.035))
            .force("y", d3.forceY(d => d.targetY).strength(1))
            .force("collide", d3.forceCollide(d => d.radius + 0.85).strength(1).iterations(10))
            .force("bounds", () => regular.forEach(d => {
                constrainX(d);
                d.y += (d.targetY - d.y) * 0.94;
                d.vy *= 0.12;
            }))
            .stop();
        for (let i = 0; i < 520; i += 1) simulation.tick();
        regular.forEach(d => {
            constrainX(d);
            d.y = Math.max(d.targetY - 1.5, Math.min(d.targetY + 1.5, d.y));
        });
    }
    const above = nodes.filter(d => d.aboveRange);
    if (above.length > 1) {
        const simulation = d3.forceSimulation(above)
            .randomSource(d3.randomLcg(0.14 + groupIndex / 100))
            .velocityDecay(0.3)
            .force("x", d3.forceX(targetX).strength(0.055))
            .force("y", d3.forceY(d => d.targetY).strength(0.18))
            .force("collide", d3.forceCollide(d => d.radius + 0.85).strength(1).iterations(10))
            .force("bounds", () => above.forEach(d => {
                constrainX(d);
                d.y = Math.max(aboveTop + d.radius, Math.min(aboveBottom - d.radius, d.y));
            }))
            .stop();
        for (let i = 0; i < 650; i += 1) simulation.tick();
    }
    above.forEach(d => {
        constrainX(d);
        d.y = Math.max(aboveTop + d.radius, Math.min(aboveBottom - d.radius, d.y));
    });
    return nodes;
}

function drawSizeLegend(radiusScale) {
    const values = [10000, 100000, 1000000];
    const width = 430;
    const legend = d3.select("#size-legend").html("").append("svg")
        .attr("viewBox", `0 0 ${width} 94`).attr("role", "img")
        .attr("aria-label", "Employment bubble-size legend");
    legend.append("text").attr("class", "size-legend-title").attr("x", 12).attr("y", 18)
        .text("Circle area = employment");
    const items = legend.selectAll("g").data(values).join("g")
        .attr("transform", (d, i) => `translate(${82 + i * 134},59)`);
    items.append("circle").attr("r", d => radiusScale(d)).attr("class", "legend-bubble");
    items.append("text").attr("y", 31).attr("text-anchor", "middle")
        .attr("class", "size-legend-label").text(d3.format(".3~s"));
}

function showTooltip(event, d) {
    tooltip.html(`
        <strong>${d.occupation}</strong>
        <span>${d.major_group}</span>
        <dl>
            <div><dt>Employment</dt><dd>${employmentText(d.employment)}</dd></div>
            <div><dt>25th percentile</dt><dd>${salaryText(d.annual_p25)}</dd></div>
            <div class="tooltip-median"><dt>Median salary</dt><dd>${salaryText(d.annual_median)}</dd></div>
            <div><dt>75th percentile</dt><dd>${salaryText(d.annual_p75)}</dd></div>
        </dl>
    `).classed("visible", true).attr("aria-hidden", "false");
    moveTooltip(event);
}

function moveTooltip(event) {
    const node = tooltip.node();
    const point = event.clientX == null
        ? (() => { const rect = event.currentTarget.getBoundingClientRect(); return {x: rect.left + rect.width / 2, y: rect.top}; })()
        : {x: event.clientX, y: event.clientY};
    const gap = 14;
    let left = point.x + gap;
    let top = point.y + gap;
    if (left + node.offsetWidth > window.innerWidth - 10) left = point.x - node.offsetWidth - gap;
    if (top + node.offsetHeight > window.innerHeight - 10) top = point.y - node.offsetHeight - gap;
    tooltip.style("left", `${Math.max(10, left)}px`).style("top", `${Math.max(10, top)}px`);
}

function hideTooltip() {
    tooltip.classed("visible", false).attr("aria-hidden", "true");
}

function activeGroup() {
    if (hoveredGroup) return hoveredGroup;
    if (selectedCode) return occupations.find(d => d.occupation_code === selectedCode)?.major_group_code;
    return selectedGroup;
}

function applyHighlights() {
    const group = activeGroup();
    d3.selectAll(".occupation-bubble")
        .classed("is-selected", d => d.occupation_code === selectedCode)
        .classed("is-hovered", d => d.occupation_code === hoveredCode)
        .classed("is-group-peer", d => group && d.major_group_code === group)
        .classed("is-faded", d => selectedCode
            ? d.occupation_code !== selectedCode
            : group && d.major_group_code !== group);
    d3.selectAll(".group-tick")
        .classed("is-active", d => d === group)
        .classed("is-faded", d => group && d !== group);
    d3.selectAll(".category-band").classed("is-active", d => d.code === group);
    d3.selectAll(".group-median")
        .classed("is-active", d => d.code === group)
        .classed("is-faded", d => group && d.code !== group);
    d3.selectAll(".occupation-bubble.is-selected, .occupation-bubble.is-hovered").raise();
}

function renderChart() {
    const availableWidth = Math.floor(chartContainer.node().clientWidth);
    if (!availableWidth || !occupations.length) return;
    renderedWidth = availableWidth;
    const width = Math.max(1280, availableWidth);
    const height = 1280;
    const margin = {top: 44, right: 32, bottom: 240, left: 100};
    const aboveTop = margin.top;
    const mainTop = 190;
    const aboveBottom = mainTop - 30;
    const mainBottom = height - margin.bottom;
    const salaryScale = d3.scaleLinear().domain([SALARY_MIN, SALARY_MAX]).range([mainBottom, mainTop]);
    const salaryTicks = d3.range(SALARY_MIN, SALARY_MAX + 1, 20000);
    const xScale = d3.scaleBand().domain(groupOrder)
        .range([margin.left, width - margin.right]).paddingInner(0.04).paddingOuter(0.015);
    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(occupations, d => d.employment)])
        .range([4 * RADIUS_REDUCTION, 25 * RADIUS_REDUCTION]);
    const nationalMedian = occupations[0].all_occupations_median;

    drawSizeLegend(radiusScale);
    chartContainer.html("");
    const scroll = chartContainer.append("div").attr("class", "unified-chart-scroll");
    const svg = scroll.append("svg").attr("width", width).attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
        .attr("aria-labelledby", "chart-svg-title chart-svg-desc");
    svg.append("title").attr("id", "chart-svg-title").text("Median annual salary across U.S. occupations, 2025");
    svg.append("desc").attr("id", "chart-svg-desc")
        .text("One grouped occupation beeswarm with a linear salary axis from 20 to 220 thousand dollars and a small non-quantitative region above it for higher salaries.");

    const bands = groupOrder.map((code, index) => ({code, index}));
    svg.selectAll("rect.category-band").data(bands, d => d.code).join("rect")
        .attr("class", d => `category-band${d.index % 2 ? " is-alternate" : ""}`)
        .attr("data-group", d => d.code)
        .attr("x", d => xScale(d.code)).attr("y", mainTop)
        .attr("width", xScale.bandwidth()).attr("height", mainBottom - mainTop);

    svg.append("g").attr("class", "salary-grid-lines")
        .selectAll("line").data(salaryTicks).join("line")
        .attr("class", d => d === SALARY_MAX ? "range-ceiling" : null)
        .attr("x1", margin.left).attr("x2", width - margin.right)
        .attr("y1", d => salaryScale(d)).attr("y2", d => salaryScale(d));
    svg.append("line").attr("class", "salary-axis-rule")
        .attr("x1", margin.left).attr("x2", margin.left)
        .attr("y1", mainTop).attr("y2", mainBottom);
    svg.append("g").attr("class", "salary-axis-labels").selectAll("text")
        .data(salaryTicks).join("text").attr("x", margin.left - 12)
        .attr("y", d => salaryScale(d) + 5).attr("text-anchor", "end")
        .text(d => `$${d / 1000}k`);
    svg.append("text").attr("class", "y-axis-title").attr("x", margin.left).attr("y", 25)
        .text("Median annual salary (USD)");

    const referenceY = salaryScale(nationalMedian);
    svg.append("line").attr("class", "national-median-line")
        .attr("x1", margin.left).attr("x2", width - margin.right)
        .attr("y1", referenceY).attr("y2", referenceY);

    const grouped = d3.group(occupations, d => d.major_group_code);
    const nodes = groupOrder.flatMap((code, index) =>
        layoutGroup(grouped.get(code), xScale, salaryScale, radiusScale, index, aboveTop, aboveBottom));
    svg.append("g").attr("class", "bubble-layer").selectAll("circle").data(nodes, d => d.occupation_code).join("circle")
        .attr("class", "occupation-bubble")
        .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.radius)
        .attr("fill", "#6285b5")
        .attr("data-group", d => d.major_group_code)
        .attr("data-salary", d => d.annual_median)
        .attr("data-above-range", d => d.aboveRange)
        .attr("data-target-x", d => d.targetX.toFixed(2))
        .attr("data-target-y", d => d.targetY.toFixed(2))
        .attr("data-radius", d => d.radius.toFixed(2))
        .attr("tabindex", 0).attr("role", "graphics-symbol")
        .attr("aria-label", d => `${d.occupation}; ${d.major_group}; median salary ${money(d.annual_median)}; employment ${integer(d.employment)}`)
        .on("mouseenter", function(event, d) {
            hoveredCode = d.occupation_code;
            hoveredGroup = d.major_group_code;
            applyHighlights();
            showTooltip(event, d);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", function() {
            hoveredCode = null;
            hoveredGroup = null;
            applyHighlights();
            hideTooltip();
        })
        .on("focus", function(event, d) {
            hoveredCode = d.occupation_code;
            hoveredGroup = d.major_group_code;
            applyHighlights();
            showTooltip(event, d);
        })
        .on("blur", function() {
            hoveredCode = null;
            hoveredGroup = null;
            applyHighlights();
            hideTooltip();
        });

    const groupMedians = groupOrder.map(code => ({
        code,
        median: d3.median(grouped.get(code), d => d.annual_median)
    }));
    const diamond = d3.symbol().type(d3.symbolDiamond).size(170);
    svg.append("g").attr("class", "group-median-layer").selectAll("path")
        .data(groupMedians).join("path").attr("class", "group-median")
        .attr("d", diamond)
        .attr("transform", d => `translate(${xScale(d.code) + xScale.bandwidth() / 2},${salaryScale(d.median)})`)
        .attr("data-group", d => d.code).attr("data-median", d => d.median)
        .attr("aria-label", d => `${GROUP_LABELS[d.code]} median of occupation medians: ${money(d.median)}`);

    const referenceLabel = svg.append("g").attr("class", "national-median-reference");
    referenceLabel.append("rect").attr("class", "national-median-label-bg")
        .attr("x", margin.left + 9).attr("y", referenceY - 28).attr("width", 218).attr("height", 24).attr("rx", 3);
    referenceLabel.append("text").attr("class", "national-median-label")
        .attr("x", margin.left + 16).attr("y", referenceY - 11)
        .text(`National median: ${money(nationalMedian)}`);

    const tickGroups = svg.append("g").attr("class", "group-axis").selectAll("g")
        .data(groupOrder).join("g").attr("class", "group-tick")
        .attr("transform", d => `translate(${xScale(d) + xScale.bandwidth() / 2},${mainBottom})`)
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", d => `Highlight ${GROUP_LABELS[d]} occupational group`)
        .on("mouseenter focus", (event, d) => { hoveredGroup = d; applyHighlights(); })
        .on("mouseleave blur", () => { hoveredGroup = null; applyHighlights(); })
        .on("click", (event, d) => selectGroup(selectedGroup === d ? null : d));
    tickGroups.append("line").attr("y2", 7);
    tickGroups.append("text").attr("class", "group-label")
        .attr("transform", "translate(-7,23) rotate(-42)")
        .attr("text-anchor", "end").text(d => GROUP_LABELS[d]);
    tickGroups.append("title").text(d => occupations.find(item => item.major_group_code === d).major_group);
    applyHighlights();
}

function selectGroup(code) {
    selectedGroup = code;
    selectedCode = null;
    searchInput.value = "";
    if (code) {
        const group = occupations.filter(d => d.major_group_code === code);
        searchStatus.textContent = `${group[0].major_group} · ${group.length} detailed occupations. Click the label again or Clear to reset.`;
    } else {
        searchStatus.textContent = "Search by occupation name, or hover and focus a circle for details.";
    }
    applyHighlights();
}

function findOccupation(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        clearSearch();
        return;
    }
    const exact = occupations.find(d => d.occupation.toLowerCase() === normalized);
    const starts = occupations.find(d => d.occupation.toLowerCase().startsWith(normalized));
    const contains = occupations.find(d => d.occupation.toLowerCase().includes(normalized));
    const match = exact || starts || contains;
    if (!match) {
        selectedCode = null;
        selectedGroup = null;
        applyHighlights();
        searchStatus.textContent = `No occupation found for “${query.trim()}”. Try another job title.`;
        return;
    }
    selectedCode = match.occupation_code;
    selectedGroup = null;
    searchInput.value = match.occupation;
    searchStatus.textContent = `${match.occupation} · ${match.major_group} · median ${money(match.annual_median)} · employment ${integer(match.employment)}`;
    applyHighlights();
    const selected = d3.select(".occupation-bubble.is-selected").node();
    if (selected) selected.scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
}

function clearSearch() {
    selectedCode = null;
    selectedGroup = null;
    searchInput.value = "";
    searchStatus.textContent = "Search by occupation name, or hover and focus a circle for details.";
    applyHighlights();
}

d3.csv(DATA_URL, row => ({
    ...row,
    employment: parseNumber(row.employment),
    annual_p25: parseNumber(row.annual_p25),
    annual_median: parseNumber(row.annual_median),
    annual_p75: parseNumber(row.annual_p75),
    all_occupations_median: parseNumber(row.all_occupations_median)
})).then(data => {
    occupations = data;
    groupOrder = Array.from(new Set(data.map(d => d.major_group_code))).sort(d3.ascending);
    document.querySelector("#occupation-count").textContent = integer(data.length);
    d3.select("#occupation-list").selectAll("option").data(data).join("option").attr("value", d => d.occupation);
    renderChart();
}).catch(error => {
    console.error(error);
    chartContainer.html(`<p class="chart-error">The occupation data could not be loaded. Please view this page through a local or GitHub Pages web server.</p>`);
});

document.querySelector("#occupation-search").addEventListener("submit", event => {
    event.preventDefault();
    findOccupation(searchInput.value);
});
document.querySelector("#clear-search").addEventListener("click", clearSearch);
searchInput.addEventListener("search", () => { if (!searchInput.value) clearSearch(); });
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const width = Math.floor(chartContainer.node().clientWidth);
        if (Math.abs(width - renderedWidth) > 4) renderChart();
    }, 180);
});

if (new URLSearchParams(window.location.search).has("capture")) {
    document.body.classList.add("capture-mode");
}
