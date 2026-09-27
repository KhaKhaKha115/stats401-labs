const DATA_URL = "../data/individual_project2/scholar_origins_2024_25.csv";
const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const DESTINATION = [-98.5795, 39.8283];
const MAXIMUM_COLOR = "#c6403d";
const mapContainer = d3.select("#flow-map");
const barsContainer = d3.select("#ranked-bars");
const tooltip = d3.select("#flow-tooltip");
const integer = d3.format(",d");
let allOrigins = [];
let world = null;
let selectedRegion = "All";
let selectedTop = "20";
let activeCode = null;
let widthScale;
let blueScale;
let maximumCode;
let resizeTimer;
let renderedWidth = 0;

function filteredOrigins() {
    const inRegion = selectedRegion === "All"
        ? allOrigins
        : allOrigins.filter(d => d.region === selectedRegion);
    const sorted = [...inRegion].sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.country, b.country));
    const shown = selectedTop === "All" ? sorted : sorted.slice(0, +selectedTop);
    return shown.map((d, index) => ({...d, viewRank: index + 1}));
}

function flowColor(d) {
    return d.country_code === maximumCode ? MAXIMUM_COLOR : blueScale(d.count);
}

function assignFlowGeometries(data, projection, height) {
    const end = projection(DESTINATION);
    const routes = data.map(d => {
        const start = projection([d.longitude, d.latitude]);
        const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        return {d, start, middle, distance: Math.hypot(end[0] - start[0], end[1] - start[1])};
    });
    d3.group(routes, route => route.d.region).forEach((regionRoutes, region) => {
        const ordered = regionRoutes.sort((a, b) => d3.descending(a.d.count, b.d.count) || d3.ascending(a.d.country, b.d.country));
        const baseOffset = Math.max(48, height * 0.065);
        const safeOffset = d3.min(ordered, (route, index) => index % 2 === 0
            ? height - route.middle[1] - 22
            : route.middle[1] - 22);
        const maximumOffset = Math.max(baseOffset, Math.min(height * 0.34, safeOffset));
        const increment = ordered.length === 1 ? 0 : (maximumOffset - baseOffset) / (ordered.length - 1);
        ordered.forEach((route, index) => {
            const direction = index % 2 === 0 ? 1 : -1;
            const curvature = baseOffset + index * increment;
            route.d.geometry = {
                start: route.start,
                control: [route.middle[0], route.middle[1] + direction * curvature],
                end,
                bundle: direction < 0 ? "up" : "down",
                region,
                regionIndex: index,
                curvature
            };
        });
    });
}

function placeCountryLabels(data, width, height) {
    const visible = data.filter(d => selectedTop !== "All" || d.viewRank <= 10)
        .sort((a, b) => d3.ascending(a.viewRank, b.viewRank));
    const occupied = [];
    const angles = [-45, 45, -110, 110, -75, 75, 0, 180, -140, 140];
    visible.forEach(d => {
        const [originX, originY] = d.geometry.start;
        const textWidth = Math.max(34, d.country.length * 6.7);
        let chosen = null;
        for (let ring = 0; ring < 6 && !chosen; ring += 1) {
            const radius = 10 + ring * 9;
            for (let step = 0; step < angles.length; step += 1) {
                const angle = angles[(step + d.viewRank) % angles.length] * Math.PI / 180;
                const dx = Math.cos(angle) * radius;
                const dy = Math.sin(angle) * radius;
                const anchor = dx < 0 ? "end" : "start";
                const x = originX + dx;
                const y = originY + dy;
                const box = {
                    left: anchor === "start" ? x : x - textWidth,
                    right: anchor === "start" ? x + textWidth : x,
                    top: y - 10,
                    bottom: y + 4
                };
                const inBounds = box.left > 4 && box.right < width - 4 && box.top > 4 && box.bottom < height - 4;
                const clear = !occupied.some(other => box.left < other.right + 3 && box.right + 3 > other.left && box.top < other.bottom + 2 && box.bottom + 2 > other.top);
                if (inBounds && clear) chosen = {x, y, anchor, box, distance: radius};
            }
        }
        if (!chosen) {
            chosen = {x: originX + 8, y: originY - 7, anchor: "start", distance: 11, box: null};
        }
        d.label = chosen;
        if (chosen.box) occupied.push(chosen.box);
    });
    data.filter(d => !visible.includes(d)).forEach(d => {
        d.label = {x: d.geometry.start[0] + 8, y: d.geometry.start[1] - 7, anchor: "start", distance: 11};
    });
}

function pointOnCurve(geometry, t) {
    const mt = 1 - t;
    return [
        mt * mt * geometry.start[0] + 2 * mt * t * geometry.control[0] + t * t * geometry.end[0],
        mt * mt * geometry.start[1] + 2 * mt * t * geometry.control[1] + t * t * geometry.end[1]
    ];
}

function arrowPath(geometry) {
    const tip = pointOnCurve(geometry, 0.93);
    const base = pointOnCurve(geometry, 0.89);
    const dx = tip[0] - base[0];
    const dy = tip[1] - base[1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const wing = 2.4;
    const x = -dy / length * wing;
    const y = dx / length * wing;
    return `M${tip[0]},${tip[1]}L${base[0] + x},${base[1] + y}L${base[0] - x},${base[1] - y}Z`;
}

function showTooltip(event, d) {
    tooltip.html(`
        <strong>${d.country}</strong>
        <span>${d.region} · ${d.year}</span>
        <dl>
            <div class="tooltip-median"><dt>International scholars</dt><dd>${integer(d.count)}</dd></div>
            <div><dt>Rank in current view</dt><dd>#${d.viewRank}</dd></div>
            <div><dt>Overall rank</dt><dd>#${d.overall_rank}</dd></div>
        </dl>
    `).classed("visible", true).attr("aria-hidden", "false");
    moveTooltip(event);
}

function moveTooltip(event) {
    const node = tooltip.node();
    const point = event.clientX == null
        ? (() => {
            const box = event.currentTarget.getBoundingClientRect();
            return {x: box.left + box.width / 2, y: box.top};
        })()
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

function activate(event, d) {
    activeCode = d.country_code;
    applyHighlight();
    showTooltip(event, d);
}

function deactivate() {
    activeCode = null;
    applyHighlight();
    hideTooltip();
}

function applyHighlight() {
    d3.selectAll(".flow-line, .flow-arrow, .origin-dot, .country-label, .country-label-line, .bar-row")
        .classed("is-active", d => activeCode && d.country_code === activeCode)
        .classed("is-faded", d => activeCode && d.country_code !== activeCode);
    d3.selectAll(".flow-line.is-active, .flow-arrow.is-active, .origin-dot.is-active, .country-label.is-active, .country-label-line.is-active, .bar-row.is-active").raise();
}

function renderMap(data) {
    const width = Math.max(320, Math.floor(mapContainer.node().clientWidth));
    const height = width < 700
        ? Math.max(360, Math.round(width * 0.78))
        : Math.min(900, Math.max(620, Math.round(width * 0.58)));
    const projection = d3.geoNaturalEarth1().fitExtent([[12, 16], [width - 12, height - 16]], {type: "Sphere"});
    const path = d3.geoPath(projection);
    const countries = topojson.feature(world, world.objects.countries);
    const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
    mapContainer.html("");
    const svg = mapContainer.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "flow-map-svg-title flow-map-svg-desc");
    svg.append("title").attr("id", "flow-map-svg-title").text("International scholar origin flows to the United States, 2024/25");
    svg.append("desc").attr("id", "flow-map-svg-desc")
        .text(`${data.length} selected positive-value origins connect to one United States destination. Within each region, routes alternate downward and upward with progressively stronger bends. Thicker, darker-blue lines represent more scholars; China, the overall maximum, is red.`);
    svg.append("path").datum({type: "Sphere"}).attr("class", "map-ocean").attr("d", path);
    svg.append("path").datum(countries).attr("class", "map-land").attr("d", path);
    svg.append("path").datum(borders).attr("class", "map-borders").attr("d", path);

    const drawOrder = [...data].sort((a, b) => d3.ascending(a.count, b.count));
    assignFlowGeometries(drawOrder, projection, height);
    placeCountryLabels(drawOrder, width, height);
    const flows = svg.append("g").attr("class", "flow-layer").selectAll("path.flow-line")
        .data(drawOrder, d => d.country_code).join("path")
        .attr("class", "flow-line")
        .attr("d", d => `M${d.geometry.start[0]},${d.geometry.start[1]}Q${d.geometry.control[0]},${d.geometry.control[1]} ${d.geometry.end[0]},${d.geometry.end[1]}`)
        .attr("stroke", flowColor)
        .style("--flow-width", d => `${widthScale(d.count)}px`)
        .attr("tabindex", 0)
        .attr("role", "graphics-symbol")
        .attr("aria-label", d => `${d.country}, ${integer(d.count)} international scholars, overall rank ${d.overall_rank}, flowing to the United States`)
        .on("mouseenter focus", activate)
        .on("mousemove", moveTooltip)
        .on("mouseleave blur", deactivate);
    flows.filter(d => d.country_code === maximumCode).raise();

    svg.append("g").attr("class", "arrow-layer").selectAll("path.flow-arrow")
        .data(drawOrder, d => d.country_code).join("path")
        .attr("class", "flow-arrow")
        .attr("d", d => arrowPath(d.geometry))
        .attr("fill", flowColor);

    const dots = svg.append("g").attr("class", "origin-layer").selectAll("circle.origin-dot")
        .data(drawOrder, d => d.country_code).join("circle")
        .attr("class", "origin-dot")
        .attr("cx", d => d.geometry.start[0])
        .attr("cy", d => d.geometry.start[1])
        .attr("r", d => d.country_code === maximumCode ? 4.2 : 2.7)
        .attr("fill", flowColor)
        .on("mouseenter", activate)
        .on("mousemove", moveTooltip)
        .on("mouseleave", deactivate);
    dots.filter(d => d.country_code === maximumCode).raise();

    const hideContextLabels = selectedTop === "All";
    svg.append("g").attr("class", "country-label-line-layer").selectAll("line.country-label-line")
        .data(drawOrder, d => d.country_code).join("line")
        .attr("class", d => `country-label-line${hideContextLabels && d.viewRank > 10 ? " is-context-hidden" : ""}`)
        .attr("x1", d => d.geometry.start[0])
        .attr("y1", d => d.geometry.start[1])
        .attr("x2", d => d.label.x + (d.label.anchor === "start" ? -3 : 3))
        .attr("y2", d => d.label.y - 2);
    svg.append("g").attr("class", "country-label-layer").selectAll("text.country-label")
        .data(drawOrder, d => d.country_code).join("text")
        .attr("class", d => `country-label${hideContextLabels && d.viewRank > 10 ? " is-context-hidden" : ""}`)
        .attr("x", d => d.label.x)
        .attr("y", d => d.label.y)
        .attr("text-anchor", d => d.label.anchor)
        .text(d => d.country);

    const destination = projection(DESTINATION);
    const destinationGroup = svg.append("g").attr("class", "destination")
        .attr("transform", `translate(${destination[0]},${destination[1]})`);
    destinationGroup.append("circle").attr("class", "destination-halo").attr("r", 8);
    destinationGroup.append("circle").attr("r", 4);
    destinationGroup.append("text").attr("x", 10).attr("y", -7).text("United States");
}

function renderBars(data) {
    const width = Math.max(300, Math.floor(barsContainer.node().clientWidth));
    const rowHeight = 25;
    const margin = {top: 34, right: 88, bottom: 20, left: width < 600 ? 132 : 170};
    const height = margin.top + data.length * rowHeight + margin.bottom;
    const maximum = d3.max(data, d => d.count);
    const x = d3.scaleLinear().domain([0, maximum]).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(data.map(d => d.country_code))
        .range([margin.top, height - margin.bottom]).paddingInner(0.22);
    barsContainer.html("");
    const svg = barsContainer.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height)
        .attr("role", "img")
        .attr("aria-labelledby", "bars-svg-title bars-svg-desc");
    svg.append("title").attr("id", "bars-svg-title").text("Ranked international scholar origin countries, 2024/25");
    svg.append("desc").attr("id", "bars-svg-desc").text(`${data.length} countries sorted from largest to smallest scholar count.`);
    svg.append("g").attr("class", "bar-grid")
        .attr("transform", `translate(0,${margin.top})`)
        .call(d3.axisTop(x).ticks(Math.max(2, Math.floor(width / 150))).tickSize(-(height - margin.top - margin.bottom)).tickFormat(d3.format("~s")))
        .call(group => group.select(".domain").remove());

    const rows = svg.append("g").selectAll("g.bar-row").data(data, d => d.country_code).join("g")
        .attr("class", "bar-row")
        .attr("tabindex", 0)
        .attr("role", "graphics-symbol")
        .attr("aria-label", d => `${d.viewRank}. ${d.country}, ${integer(d.count)} international scholars`)
        .on("mouseenter focus", activate)
        .on("mousemove", moveTooltip)
        .on("mouseleave blur", deactivate);
    rows.append("text").attr("class", "bar-country")
        .attr("x", margin.left - 9)
        .attr("y", d => y(d.country_code) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .text(d => `${d.viewRank}. ${d.country}`);
    rows.append("rect").attr("class", "bar-mark")
        .attr("x", margin.left)
        .attr("y", d => y(d.country_code))
        .attr("width", d => Math.max(1, x(d.count) - margin.left))
        .attr("height", y.bandwidth())
        .attr("fill", flowColor);
    rows.append("text").attr("class", "bar-value")
        .attr("x", d => x(d.count) + 5)
        .attr("y", d => y(d.country_code) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text(d => integer(d.count));
}

function render() {
    if (!allOrigins.length || !world) return;
    const data = filteredOrigins();
    renderedWidth = Math.floor(document.querySelector(".flow-layout").clientWidth);
    const regionalTotal = selectedRegion === "All" ? allOrigins.length : allOrigins.filter(d => d.region === selectedRegion).length;
    const scholarTotal = d3.sum(data, d => d.count);
    const scope = selectedRegion === "All" ? "all regions" : selectedRegion;
    const selection = selectedTop === "All" ? `all ${data.length}` : `top ${data.length}`;
    d3.select("#flow-status").text(`Showing ${selection} of ${regionalTotal} positive-value origins in ${scope} · ${integer(scholarTotal)} scholars represented · 2024/25`);
    renderMap(data);
    renderBars(data);
    applyHighlight();
}

function setControl(groupSelector, attribute, value) {
    d3.select(groupSelector).selectAll("button")
        .classed("active", function() { return this.dataset[attribute] === value; })
        .attr("aria-pressed", function() { return this.dataset[attribute] === value ? "true" : "false"; });
}

d3.selectAll("#region-controls button").on("click", function() {
    selectedRegion = this.dataset.region;
    setControl("#region-controls", "region", selectedRegion);
    deactivate();
    render();
});

d3.selectAll("#top-controls button").on("click", function() {
    selectedTop = this.dataset.top;
    setControl("#top-controls", "top", selectedTop);
    deactivate();
    render();
});

Promise.all([
    d3.csv(DATA_URL, row => ({
        ...row,
        count: row.count === "" ? null : +row.count,
        overall_rank: row.overall_rank === "" ? null : +row.overall_rank,
        latitude: +row.latitude,
        longitude: +row.longitude
    })),
    d3.json(WORLD_URL)
]).then(([rows, mapData]) => {
    allOrigins = rows.filter(d => d.count_status === "positive" && Number.isFinite(d.count) && d.count > 0 && Number.isFinite(d.latitude) && Number.isFinite(d.longitude));
    allOrigins.sort((a, b) => d3.descending(a.count, b.count));
    world = mapData;
    maximumCode = allOrigins[0].country_code;
    widthScale = d3.scaleSqrt()
        .domain([1, d3.max(allOrigins, d => d.count)])
        .range([0.85, 12]);
    blueScale = d3.scaleSqrt()
        .domain([1, d3.max(allOrigins, d => d.count)])
        .range(["#8cbddd", "#175f9b"])
        .interpolate(d3.interpolateLab);
    render();
}).catch(error => {
    console.error(error);
    const message = "The visualization data or basemap could not be loaded. Please view this page through a local or GitHub Pages web server with an internet connection.";
    mapContainer.html(`<p class="chart-error">${message}</p>`);
    barsContainer.html(`<p class="chart-error">${message}</p>`);
    d3.select("#flow-status").text("Visualization unavailable.");
});

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const width = Math.floor(document.querySelector(".flow-layout").clientWidth);
        if (Math.abs(width - renderedWidth) > 4) render();
    }, 180);
});

if (new URLSearchParams(window.location.search).has("capture")) {
    document.body.classList.add("capture-mode");
}
