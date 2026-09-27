const state = {
    searchQuery: "",
    selectedSection: null,
    selectedTopic: null,
    selectedPassageId: null,
    selectedMatrixCell: null
};

const paths = {
    map: "data/lab8_embedding_map.csv",
    matrix: "data/lab8_topic_section_matrix.csv",
    neighbors: "data/lab8_nearest_neighbors.csv"
};

const topicPalette = ["#5e4fa2", "#3288bd", "#66c2a5", "#abdda4", "#e6b44a", "#f46d43", "#d53e4f", "#8b5a83"];
const unsectionedLabel = "Chapter Introduction / Front Matter";
const tooltip = d3.select("#lab8-tooltip");
const formatInteger = d3.format(",d");
const formatPercent = d3.format(".1%");
const formatSimilarity = d3.format(".3f");

let passages = [];
let matrixData = [];
let topics = [];
let sections = [];
let passageById = new Map();
let neighborsById = new Map();
let topicColor;
let pointSelection;
let matrixCellSelection;
let mapSvg;
let mapZoom;

loadData();

async function loadData() {
    try {
        const [mapRows, matrixRows, neighborRows] = await Promise.all([
            d3.csv(paths.map, d => ({
                ...d,
                page: +d.page,
                word_count: +d.word_count,
                cluster: +d.cluster,
                x: +d.x,
                y: +d.y
            })),
            d3.csv(paths.matrix, d => ({
                ...d,
                count: +d.count,
                section_total: +d.section_total,
                proportion: +d.proportion
            })),
            d3.csv(paths.neighbors, d => ({
                ...d,
                rank: +d.rank,
                similarity: +d.similarity
            }))
        ]);
        prepareData(mapRows, matrixRows, neighborRows);
        renderCorpusOverview();
        buildControls();
        drawSemanticMap();
        drawTopicSectionMatrix();
        renderSemanticFindings();
        updateCoordinatedViews();
    } catch (error) {
        console.error("Lab 8 data loading failed:", error);
        showLoadError(error);
    }
}

function prepareData(mapRows, matrixRows, neighborRows) {
    const requiredMap = ["passage_id", "section", "text", "cluster_name", "x", "y", "word_count"];
    if (!mapRows.length || requiredMap.some(key => !(key in mapRows[0]))) {
        throw new Error("The embedding map CSV is empty or missing required columns.");
    }
    if (!matrixRows.length || !neighborRows.length) {
        throw new Error("The topic matrix or nearest-neighbor CSV is empty.");
    }
    passages = mapRows.filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));
    matrixData = matrixRows;
    topics = Array.from(d3.group(passages, d => d.cluster), ([cluster, rows]) => ({
        cluster,
        name: rows[0].cluster_name
    })).sort((a, b) => d3.ascending(a.cluster, b.cluster));
    sections = Array.from(new Set(passages.map(d => d.section))).sort(d3.ascending);
    passageById = new Map(passages.map(d => [d.passage_id, d]));
    neighborsById = d3.group(neighborRows.sort((a, b) => d3.ascending(a.rank, b.rank)), d => d.passage_id);
    topicColor = d3.scaleOrdinal(topics.map(d => d.name), topicPalette);
}

function renderCorpusOverview() {
    const stats = [
        [formatInteger(passages.length), "passages"],
        [d3.format(".1f")(d3.mean(passages, d => d.word_count)), "average words"],
        [formatInteger(sections.filter(section => section !== unsectionedLabel).length), "formal sections"],
        [formatInteger(topics.length), "semantic topics"]
    ];
    const statCards = d3.select("#summary-stats").selectAll("div").data(stats);
    statCards.select("strong").text(d => d[0]);
    statCards.select("span").text(d => d[1]);
    drawSectionBarChart();
    drawLengthHistogram();
}

function drawSectionBarChart() {
    const counts = Array.from(d3.rollup(passages, v => v.length, d => d.section), ([section, count]) => ({section, count}))
        .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.section, b.section));
    const width = 760;
    const rowHeight = 35;
    const margin = {top: 18, right: 45, bottom: 45, left: 320};
    const height = margin.top + counts.length * rowHeight + margin.bottom;
    const host = d3.select("#section-bar-chart").html("");
    const svg = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Horizontal bar chart of passage counts in every formal section");
    const x = d3.scaleLinear().domain([0, d3.max(counts, d => d.count)]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(counts.map(d => d.section)).range([margin.top, height - margin.bottom]).padding(0.2);
    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""));
    svg.selectAll("rect").data(counts).join("rect").attr("class", "lab8-overview-bar").attr("x", margin.left).attr("y", d => y(d.section)).attr("width", d => x(d.count) - margin.left).attr("height", y.bandwidth())
        .on("pointerenter", (event, d) => showTooltip(event, [`${d.section}`, `${formatInteger(d.count)} passages`]))
        .on("pointermove", moveTooltip).on("pointerleave", hideTooltip);
    svg.selectAll(".lab8-bar-value").data(counts).join("text").attr("class", "lab8-bar-value").attr("x", d => x(d.count) + 5).attr("y", d => y(d.section) + y.bandwidth() / 2 + 4).text(d => formatInteger(d.count));
    const labels = svg.selectAll(".lab8-bar-label").data(counts).join("text").attr("class", "lab8-bar-label").attr("x", margin.left - 10).attr("y", d => y(d.section) + y.bandwidth() / 2).attr("text-anchor", "end");
    labels.each(function(d) { appendWrappedLabel(d3.select(this), d.section, 46); });
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5));
    svg.append("text").attr("class", "axis-label").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 7).attr("text-anchor", "middle").text("Number of passages");
}

function appendWrappedLabel(selection, value, maxCharacters) {
    const words = value.split(/\s+/);
    const lines = [""];
    words.forEach(word => {
        const current = lines[lines.length - 1];
        if ((current + " " + word).trim().length <= maxCharacters || lines.length === 2) lines[lines.length - 1] = (current + " " + word).trim();
        else lines.push(word);
    });
    const offset = lines.length === 1 ? 4 : -2;
    lines.forEach((line, index) => selection.append("tspan").attr("x", selection.attr("x")).attr("dy", index === 0 ? offset : 11).text(line));
}

function drawLengthHistogram() {
    const width = 760;
    const height = 470;
    const margin = {top: 22, right: 25, bottom: 62, left: 62};
    const maxWords = d3.max(passages, d => d.word_count);
    const x = d3.scaleLinear().domain([0, maxWords]).nice().range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(24)).value(d => d.word_count)(passages);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);
    const host = d3.select("#length-histogram").html("");
    const svg = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Histogram of passage word counts");
    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""));
    svg.selectAll("rect").data(bins).join("rect").attr("class", "lab8-histogram-bar").attr("x", d => x(d.x0) + 1).attr("y", d => y(d.length)).attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2)).attr("height", d => y(0) - y(d.length))
        .on("pointerenter", (event, d) => showTooltip(event, [`${Math.round(d.x0)}–${Math.round(d.x1)} words`, `${formatInteger(d.length)} passages`]))
        .on("pointermove", moveTooltip).on("pointerleave", hideTooltip);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6));
    svg.append("text").attr("class", "axis-label").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 14).attr("text-anchor", "middle").text("Passage length (words)");
    svg.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -(margin.top + height - margin.bottom) / 2).attr("y", 17).attr("text-anchor", "middle").text("Number of passages");
}

function buildControls() {
    d3.select("#lab8-section-filter").selectAll("option.lab8-option").data(sections).join("option").attr("class", "lab8-option").attr("value", d => d).text(d => d);
    d3.select("#lab8-topic-filter").selectAll("option.lab8-option").data(topics.map(d => d.name)).join("option").attr("class", "lab8-option").attr("value", d => d).text(d => d);
    d3.select("#lab8-search").on("input", function() { state.searchQuery = this.value.toLowerCase().trim(); updateCoordinatedViews(); });
    d3.select("#lab8-section-filter").on("change", function() { state.selectedSection = this.value || null; updateCoordinatedViews(); });
    d3.select("#lab8-topic-filter").on("change", function() { state.selectedTopic = this.value || null; updateCoordinatedViews(); });
    d3.select("#lab8-clear-filters").on("click", resetFilters);
    d3.select("#lab8-clear-selection").on("click", clearSelection);
    d3.select("#lab8-reset-zoom").on("click", resetZoom);
}

function drawSemanticMap() {
    const width = 920;
    const height = 690;
    const margin = 28;
    const host = d3.select("#semantic-map").html("");
    mapSvg = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "UMAP semantic embedding map of bulletin passages");
    const clipId = "lab8-map-clip";
    mapSvg.append("defs").append("clipPath").attr("id", clipId).append("rect").attr("x", margin).attr("y", margin).attr("width", width - margin * 2).attr("height", height - margin * 2).attr("rx", 8);
    mapSvg.append("rect").attr("class", "lab8-map-background").attr("x", margin).attr("y", margin).attr("width", width - margin * 2).attr("height", height - margin * 2).attr("rx", 8);
    const x = d3.scaleLinear().domain(d3.extent(passages, d => d.x)).nice().range([margin + 10, width - margin - 10]);
    const y = d3.scaleLinear().domain(d3.extent(passages, d => d.y)).nice().range([height - margin - 10, margin + 10]);
    const radius = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([2.1, 8.5]).clamp(true);
    const zoomLayer = mapSvg.append("g").attr("clip-path", `url(#${clipId})`).append("g");
    pointSelection = zoomLayer.selectAll("circle").data(passages, d => d.passage_id).join("circle").attr("class", "lab8-passage-point").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", d => radius(d.word_count)).attr("fill", d => topicColor(d.cluster_name)).attr("data-base-radius", d => radius(d.word_count))
        .on("pointerenter", (event, d) => showTooltip(event, [d.cluster_name, d.section, `Page ${d.page} · ${d.word_count} words`, excerpt(d.text, 145)]))
        .on("pointermove", moveTooltip).on("pointerleave", hideTooltip)
        .on("click", (event, d) => { event.stopPropagation(); selectPassage(d.passage_id); });
    mapZoom = d3.zoom().scaleExtent([0.75, 14]).translateExtent([[0, 0], [width, height]]).on("zoom", event => zoomLayer.attr("transform", event.transform));
    mapSvg.call(mapZoom).on("dblclick.zoom", null).on("click", event => { if (event.target.classList.contains("lab8-map-background")) clearSelection(); });
    const legend = d3.select("#topic-legend").html("").selectAll("button").data(topics).join("button").attr("type", "button").attr("class", "lab8-legend-item").on("click", (_, d) => {
        state.selectedTopic = state.selectedTopic === d.name ? null : d.name;
        d3.select("#lab8-topic-filter").property("value", state.selectedTopic || "");
        updateCoordinatedViews();
    });
    legend.append("i").style("background", d => topicColor(d.name));
    legend.append("span").text(d => d.name);
}

function drawTopicSectionMatrix() {
    const rowHeight = 27;
    const cellWidth = 112;
    const margin = {top: 190, right: 28, bottom: 28, left: 330};
    const width = margin.left + topics.length * cellWidth + margin.right;
    const height = margin.top + sections.length * rowHeight + margin.bottom;
    const maxCount = d3.max(matrixData, d => d.count);
    const color = d3.scaleSequentialSqrt(d3.interpolatePurples).domain([0, maxCount]);
    const host = d3.select("#topic-section-matrix").html("");
    const svg = host.append("svg").attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Matrix of passage counts by formal section and semantic topic");
    const x = d3.scaleBand().domain(topics.map(d => d.name)).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(sections).range([margin.top, height - margin.bottom]);
    matrixCellSelection = svg.append("g").selectAll("rect").data(matrixData, d => `${d.section}|||${d.cluster_name}`).join("rect").attr("class", "lab8-matrix-cell").attr("x", d => x(d.cluster_name)).attr("y", d => y(d.section)).attr("width", x.bandwidth() - 1).attr("height", y.bandwidth() - 1).attr("fill", d => color(d.count))
        .on("pointerenter", (event, d) => showTooltip(event, [d.section, d.cluster_name, `${formatInteger(d.count)} passages`, `${formatPercent(d.proportion)} of this section`]))
        .on("pointermove", moveTooltip).on("pointerleave", hideTooltip)
        .on("click", (_, d) => {
            const same = state.selectedMatrixCell?.section === d.section && state.selectedMatrixCell?.topic === d.cluster_name;
            state.selectedMatrixCell = same ? null : {section: d.section, topic: d.cluster_name};
            state.selectedPassageId = null;
            renderPassageDetails();
            updateCoordinatedViews();
        });
    svg.append("g").attr("class", "lab8-matrix-y-labels").selectAll("text").data(sections).join("text").attr("x", margin.left - 10).attr("y", d => y(d) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d);
    svg.append("g").attr("class", "lab8-matrix-x-labels").selectAll("text").data(topics).join("text").attr("transform", d => `translate(${x(d.name) + x.bandwidth() / 2},${margin.top - 10}) rotate(-42)`).attr("text-anchor", "start").text(d => d.name);
    const legend = d3.select("#matrix-legend").html("");
    legend.append("span").text("Passage count");
    legend.append("div").attr("class", "lab8-gradient").style("background", `linear-gradient(to right, ${color(0)}, ${color(maxCount)})`);
    legend.append("span").text("0");
    legend.append("span").text(formatInteger(maxCount));
}

function passageMatchesFilters(d) {
    const queryMatch = !state.searchQuery || d.text.toLowerCase().includes(state.searchQuery);
    const sectionMatch = !state.selectedSection || d.section === state.selectedSection;
    const topicMatch = !state.selectedTopic || d.cluster_name === state.selectedTopic;
    const matrixMatch = !state.selectedMatrixCell || (d.section === state.selectedMatrixCell.section && d.cluster_name === state.selectedMatrixCell.topic);
    return queryMatch && sectionMatch && topicMatch && matrixMatch;
}

function updateCoordinatedViews() {
    if (!pointSelection || !matrixCellSelection) return;
    const matching = passages.filter(passageMatchesFilters);
    const selected = passageById.get(state.selectedPassageId);
    const neighborIds = new Set((neighborsById.get(state.selectedPassageId) || []).map(d => d.neighbor_id));
    pointSelection
        .classed("is-match", d => passageMatchesFilters(d))
        .classed("is-selected", d => d.passage_id === state.selectedPassageId)
        .classed("is-neighbor", d => neighborIds.has(d.passage_id))
        .attr("opacity", d => {
            if (d.passage_id === state.selectedPassageId) return 1;
            if (neighborIds.has(d.passage_id)) return 0.92;
            return passageMatchesFilters(d) ? 0.76 : 0.045;
        })
        .attr("r", function(d) {
            const base = +this.dataset.baseRadius;
            if (d.passage_id === state.selectedPassageId) return base + 4.5;
            if (neighborIds.has(d.passage_id)) return base + 2.5;
            return base;
        });
    pointSelection.filter(d => neighborIds.has(d.passage_id)).raise();
    pointSelection.filter(d => d.passage_id === state.selectedPassageId).raise();

    const highlightedCell = state.selectedMatrixCell || (selected ? {section: selected.section, topic: selected.cluster_name} : null);
    matrixCellSelection.classed("is-selected", d => highlightedCell && d.section === highlightedCell.section && d.cluster_name === highlightedCell.topic);
    d3.selectAll(".lab8-legend-item").classed("is-active", d => d.name === state.selectedTopic);
    const constraints = [];
    if (state.searchQuery) constraints.push(`search “${state.searchQuery}”`);
    if (state.selectedSection) constraints.push("section filter");
    if (state.selectedTopic) constraints.push("topic filter");
    if (state.selectedMatrixCell) constraints.push("matrix selection");
    d3.select("#lab8-match-count").text(`${formatInteger(matching.length)} of ${formatInteger(passages.length)} passages match${constraints.length ? ` (${constraints.join(" + ")})` : ""}.`);
}

function selectPassage(passageId) {
    state.selectedPassageId = passageId;
    state.selectedMatrixCell = null;
    renderPassageDetails();
    updateCoordinatedViews();
}

function renderPassageDetails() {
    const panel = d3.select("#detail-panel").html("");
    const passage = passageById.get(state.selectedPassageId);
    panel.append("p").attr("class", "lab8-eyebrow").text("PASSAGE DETAILS");
    if (!passage) {
        panel.append("h3").text(state.selectedMatrixCell ? "Matrix cell selected" : "Select a passage");
        panel.append("p").text(state.selectedMatrixCell ? `${state.selectedMatrixCell.section} × ${state.selectedMatrixCell.topic}. Matching passages are highlighted on the map.` : "Click a point to keep its metadata, original text, and five nearest semantic neighbors here.");
        return;
    }
    panel.append("h3").text(passage.section);
    const meta = panel.append("dl").attr("class", "lab8-detail-meta");
    [
        ["Passage ID", passage.passage_id], ["Chapter", passage.chapter || "Not specified"],
        ["Section", passage.section], ["Subsection", passage.subsection || "Not specified"],
        ["Page", passage.page], ["Semantic topic", passage.cluster_name]
    ].forEach(([term, value]) => { const row = meta.append("div"); row.append("dt").text(term); row.append("dd").text(value); });
    panel.append("h4").text("Original passage");
    panel.append("p").attr("class", "lab8-passage-text").text(passage.text);
    panel.append("h4").text("Five nearest semantic neighbors");
    renderNearestNeighbors(panel, passage.passage_id);
    panel.append("button").attr("type", "button").attr("class", "lab8-detail-clear").text("Deselect passage").on("click", clearSelection);
}

function renderNearestNeighbors(panel, passageId) {
    const neighborRows = neighborsById.get(passageId) || [];
    if (!neighborRows.length) { panel.append("p").text("No neighbor data available for this passage."); return; }
    const list = panel.append("ol").attr("class", "lab8-neighbor-list");
    const items = list.selectAll("li").data(neighborRows).join("li");
    const buttons = items.append("button").attr("type", "button").on("click", (_, d) => selectPassage(d.neighbor_id));
    buttons.append("strong").text(d => passageById.get(d.neighbor_id)?.section || d.neighbor_id);
    buttons.append("span").text(d => { const p = passageById.get(d.neighbor_id); return `Page ${p?.page ?? "—"} · similarity ${formatSimilarity(d.similarity)}`; });
    buttons.append("small").text(d => excerpt(passageById.get(d.neighbor_id)?.text || "", 150));
}

function resetFilters() {
    state.searchQuery = "";
    state.selectedSection = null;
    state.selectedTopic = null;
    d3.select("#lab8-search").property("value", "");
    d3.select("#lab8-section-filter").property("value", "");
    d3.select("#lab8-topic-filter").property("value", "");
    updateCoordinatedViews();
}

function clearSelection() {
    state.selectedPassageId = null;
    state.selectedMatrixCell = null;
    renderPassageDetails();
    updateCoordinatedViews();
}

function resetZoom() {
    if (mapSvg && mapZoom) mapSvg.transition().duration(450).call(mapZoom.transform, d3.zoomIdentity);
}

function renderSemanticFindings() {
    const topicCounts = Array.from(d3.rollup(passages, v => v.length, d => d.cluster_name), ([topic, count]) => ({topic, count})).sort((a, b) => d3.descending(a.count, b.count));
    const topicSectionBreadth = Array.from(d3.rollup(passages, v => new Set(v.map(d => d.section)).size, d => d.cluster_name), ([topic, count]) => ({topic, count})).sort((a, b) => d3.descending(a.count, b.count));
    const sectionDiversity = Array.from(d3.group(passages, d => d.section), ([section, rows]) => {
        const counts = Array.from(d3.rollup(rows, v => v.length, d => d.cluster_name).values());
        const entropy = -d3.sum(counts, count => { const p = count / rows.length; return p * Math.log2(p); });
        return {section, topics: counts.length, entropy, count: rows.length};
    }).filter(d => d.count >= 5).sort((a, b) => d3.descending(a.entropy, b.entropy) || d3.descending(a.topics, b.topics));
    const crossSectionPair = Array.from(neighborsById, ([sourceId, rows]) => rows.map(row => ({source: passageById.get(sourceId), target: passageById.get(row.neighbor_id), similarity: row.similarity}))).flat().filter(d => d.source && d.target && d.source.section !== d.target.section).sort((a, b) => d3.descending(a.similarity, b.similarity))[0];
    const searchTerms = ["credit", "graduation", "registration", "academic integrity"];
    const searchSummary = searchTerms.map(term => {
        const matches = passages.filter(d => d.text.toLowerCase().includes(term));
        const topicCount = new Set(matches.map(d => d.cluster_name)).size;
        return `${term} (${matches.length} passages across ${topicCount} topic${topicCount === 1 ? "" : "s"})`;
    }).join("; ");
    const findings = [
        ["Major semantic topics", `The largest clusters are ${topicCounts.slice(0, 3).map(d => `${d.topic} (${d.count})`).join(", ")}. All eight labels come from cluster terms and representative passages, not section headings alone.`],
        ["Topics across formal sections", `${topicSectionBreadth[0].topic} is the most widely distributed topic, appearing in ${topicSectionBreadth[0].count} of ${sections.length} formal sections. ${topicSectionBreadth[1].topic} follows across ${topicSectionBreadth[1].count} sections.`],
        ["Most semantically diverse sections", `Among sections with at least five passages, ${sectionDiversity[0].section} has the highest topic entropy (${sectionDiversity[0].entropy.toFixed(2)} bits) and spans ${sectionDiversity[0].topics} topics. ${sectionDiversity[1].section} is next (${sectionDiversity[1].entropy.toFixed(2)} bits).`],
        ["Similarity across sections", crossSectionPair ? `${crossSectionPair.source.passage_id} in “${crossSectionPair.source.section}” and ${crossSectionPair.target.passage_id} in “${crossSectionPair.target.section}” form the strongest cross-section neighbor pair found in the saved top-five lists (cosine similarity ${formatSimilarity(crossSectionPair.similarity)}).` : "No cross-section neighbor pair was available."],
        ["Policy searches cross regions", `${searchSummary}. The terms therefore do not all occupy one semantic region; use the search control to see their distributions and inspect the matching passages.`]
    ];
    const cards = d3.select("#semantic-findings").html("").selectAll("article").data(findings).join("article").attr("class", "lab8-finding");
    cards.append("h3").text((d, i) => `${String(i + 1).padStart(2, "0")} · ${d[0]}`);
    cards.append("p").text(d => d[1]);
}

function showTooltip(event, lines) {
    tooltip.html("");
    lines.forEach((line, index) => tooltip.append(index === 0 ? "strong" : "span").text(line));
    tooltip.classed("visible", true);
    moveTooltip(event);
}

function moveTooltip(event) {
    tooltip.style("left", `${Math.min(event.clientX + 16, window.innerWidth - 310)}px`).style("top", `${Math.min(event.clientY + 16, window.innerHeight - 170)}px`);
}

function hideTooltip() { tooltip.classed("visible", false); }
function excerpt(text, length) { const clean = text.replace(/\s+/g, " ").trim(); return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean; }

function showLoadError(error) {
    const message = `Could not load the required Lab 8 semantic datasets. Run semantic_analysis.py and serve the repository through a local HTTP server. ${error.message || ""}`;
    ["#section-bar-chart", "#length-histogram", "#semantic-map", "#topic-section-matrix", "#semantic-findings"].forEach(selector => d3.select(selector).html("").append("p").attr("class", "chart-error").text(message));
    d3.select("#lab8-match-count").text("Semantic data unavailable.");
}
