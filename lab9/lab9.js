const width = 1100;
const height = 620;
const tooltip = d3.select("#lab9-tooltip");
const noDataColor = "#e5e5e5";
const legendHeight = 130;
const totalHeight = height + legendHeight;
Promise.all([
    d3.json("../data/world.geojson"),
    d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({
        iso3: d.iso3,
        country: d.country,
        gdp: +d.gdp_2025_billion_usd,
        rank: +d.rank
    }))
]).then(([geoData, gdpData]) => {
    const gdpByIso = new Map(gdpData.map(d => [d.iso3, d]));
    geoData.features.forEach(feature => {
        const iso = getIso3(feature);
        const record = gdpByIso.get(iso) || null;
        feature.properties.iso3 = iso;
        feature.properties.gdpData = record;
        feature.properties.countryName = record?.country || getCountryName(feature);
        feature.properties.gdp = record?.gdp ?? null;
        feature.properties.rank = record?.rank ?? null;
    });
    drawChoropleth(geoData, gdpData);
    drawCartogram(geoData, gdpData);
}).catch(error => console.error("Lab 9 data loading error:", error));
function getIso3(feature) {
    const p = feature.properties;
    return p.iso3 || p.ISO_A3 || p.ADM0_A3 || p.iso_a3 || p.adm0_a3 || p.ISO3 || null;
}
function getCountryName(feature) {
    const p = feature.properties;
    return p.name || p.NAME || p.ADMIN || p.name_long || "Unknown";
}
function drawChoropleth(geoData, gdpData) {
    const container = d3.select("#lab9-choropeth");
    container.append("h2")
        .text("2025 Nominal GDP Choropleth");
    container.append("p")
        .text("Color represents nominal GDP in billions of U.S. dollars. Gray countries are not included in the top-50 dataset.");
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${totalHeight}`)
        .attr("width", "100%");
    const mapGroup = svg.append("g");
    const projection = d3.geoNaturalEarth1()
        .fitExtent([[20, 70], [width - 20, height - 70]], geoData);
    const path = d3.geoPath().projection(projection);
    const validGDP = gdpData.map(d => d.gdp).filter(d => d > 0);
    const minGDP = d3.min(validGDP);
    const maxGDP = d3.max(validGDP);
    const colorScale = d3.scaleSequentialLog()
        .domain([minGDP, maxGDP])
        .interpolator(d3.interpolateRgb("#F9D1F7", "#E440DE"));;
    mapGroup.selectAll(".country")
        .data(geoData.features)
        .join("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", d => {
            const value = d.properties.gdpData?.gdp;
            return value == null ? noDataColor : colorScale(value);
        })
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.6)
        .attr("data-iso", d => d.properties.iso3)
        .on("mouseover", function(event, d) {
            highlightCountry(d.properties.iso3);
            const record = d.properties.gdpData;
            const country = record?.country || getCountryName(d);
            showTooltip(event, country, record);
        })
        .on("mousemove", event => moveTooltip(event))
        .on("mouseout", () => {
            clearHighlight();
            hideTooltip();
        });
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", event => {
            mapGroup.attr("transform", event.transform);
            mapGroup.attr("stroke-width", 1 / event.transform.k);
        });
    svg.call(zoom);
    drawLegend(svg, colorScale, minGDP, maxGDP);
}
function drawCartogram(geoData, gdpData) {
    const container = d3.select("#lab9-cartogram");
    container.append("h2")
        .text("2025 Nominal GDP Cartogram");
    container.append("p")
        .text("Country area is distorted according to 2025 nominal GDP. Scroll to zoom and drag to pan.");
    const projection = d3.geoNaturalEarth1()
        .fitExtent([[20, 70], [width - 20, height - 70]], geoData);
    const geoPath = d3.geoPath().projection(projection);
    const dataFeatures = geoData.features.filter(d => d.properties.gdpData);
    const originalDataArea = d3.sum(dataFeatures, d => Math.abs(geoPath.area(d)));
    const totalGDP = d3.sum(gdpData, d => d.gdp);
    const gdpAreaFactor = originalDataArea / totalGDP;
    geoData.features.forEach(feature => {
        const originalArea = Math.max(Math.abs(geoPath.area(feature)), 0.001);
        const record = feature.properties.gdpData;
        feature.properties.cartogramWeight = record ? record.gdp * gdpAreaFactor : originalArea;
    });
    const topology = topojson.topology({
        countries: geoData
    }, 1e5);
    const host = container.append("div")
        .attr("class", "cartogram-host")
        .node();
    const cartogram = new Cartogram(host);
    cartogram
        .width(width)
        .height(height)
        .topoObjectName("countries")
        .projection(projection)
        .iterations(25)
        .value(d => d.properties.cartogramWeight)
        .color(d => d.properties.gdpData ? "#F4AFF1" : noDataColor)
        .label(() => null)
        .tooltipContent(() => null)
        .topoJson(topology);
    requestAnimationFrame(() => {
        const svg = d3.select(host).select("svg");
        svg
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("width", null)
            .attr("height", null)
            .style("width", "100%")
            .style("height", "auto");
        let cartogramLayer;
        const paths = svg.selectAll("path.feature");
        if (!paths.empty()) {
            const parent = paths.node().parentNode;
            if (parent.tagName.toLowerCase() === "g") {
                cartogramLayer = d3.select(parent)
                    .classed("cartogram-zoom-layer", true);
            } else {
                cartogramLayer = svg.append("g")
                    .attr("class", "cartogram-zoom-layer");
                paths.each(function() {
                    cartogramLayer.node().appendChild(this);
                });
            }
        }
        svg.selectAll("path.feature")
            .attr("vector-effect", "non-scaling-stroke")
            .style("cursor", "pointer");
        d3.select(host)
            .on("pointermove.linked", function(event) {
                const target = event.target.closest?.("path.feature");
                if (!target || !host.contains(target)) {
                    clearHighlight();
                    hideTooltip();
                    return;
                }
                const d = d3.select(target).datum();
                if (!d?.properties) {
                    clearHighlight();
                    hideTooltip();
                    return;
                }
                const iso = d.properties.iso3;
                const record = d.properties.gdpData;
                const country = d.properties.countryName || getCountryName(d);
                if (iso) {
                    highlightCountry(iso);
                }
                showTooltip(event, country, record);
            })
            .on("pointerleave.linked", function() {
                clearHighlight();
                hideTooltip();
            });
        if (cartogramLayer) {
            const zoom = d3.zoom()
                .scaleExtent([1, 8])
                .on("zoom", event => {
                    cartogramLayer.attr("transform", event.transform);
                });
            svg.call(zoom);
        }
    });
}
function showTooltip(event, country, record) {
    tooltip
        .style("opacity", 1)
        .html(record
            ? `<strong>${country}</strong><br>GDP: $${d3.format(",.0f")(record.gdp)} billion<br>Rank: #${record.rank}`
            : `<strong>${country}</strong><br>No GDP data in top 50`);
    moveTooltip(event);
}
function moveTooltip(event) {
    tooltip
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`);
}
function hideTooltip() {
    tooltip.style("opacity", 0);
}

function drawLegend(svg, colorScale, minGDP, maxGDP) {
    const legendWidth = 500;
    const gradientHeight = 20;
    const x = 42;
    const y = height + 35;
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "gdp-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");
    d3.range(0, 1.01, 0.1).forEach(t => {
        const value = Math.exp(Math.log(minGDP) + t * (Math.log(maxGDP) - Math.log(minGDP)));
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", colorScale(value));
    });
    const legend = svg.append("g")
        .attr("class", "gdp-legend")
        .attr("transform", `translate(${x},${y})`);
    legend.append("rect")
        .attr("class", "gdp-legend-bg")
        .attr("x", -18)
        .attr("y", -42)
        .attr("width", legendWidth + 36)
        .attr("height", 104)
        .attr("rx", 12);
    legend.append("text")
        .attr("class", "gdp-legend-title")
        .attr("x", 0)
        .attr("y", -17)
        .text("2025 GDP · billion USD");
    legend.append("rect")
        .attr("class", "gdp-legend-gradient")
        .attr("width", legendWidth)
        .attr("height", gradientHeight)
        .attr("rx", 4)
        .attr("fill", "url(#gdp-gradient)");
    const scale = d3.scaleLog()
        .domain([minGDP, maxGDP])
        .range([0, legendWidth]);
    const tickValues = [300, 1000, 3000, 10000, 30000]
        .filter(d => d >= minGDP && d <= maxGDP);
    legend.append("g")
        .attr("class", "gdp-legend-axis")
        .attr("transform", `translate(0,${gradientHeight})`)
        .call(d3.axisBottom(scale)
            .tickValues(tickValues)
            .tickFormat(d => `$${d3.format(",")(d)}B`)
            .tickSize(10)
            .tickPadding(9))
        .call(g => g.select(".domain").remove());
}

function highlightCountry(iso3) {
    d3.selectAll(".country")
        .attr("opacity", d => d.properties.iso3 === iso3 ? 1 : 0.3)
        .attr("stroke", d => d.properties.iso3 === iso3 ? "#111" : "#fff")
        .attr("stroke-width", d => d.properties.iso3 === iso3 ? 2 : 0.6);
    d3.selectAll("#lab9-cartogram path.feature")
        .attr("opacity", d => d?.properties?.iso3 === iso3 ? 1 : 0.25)
        .attr("stroke", d => d?.properties?.iso3 === iso3 ? "#111" : "#aaa")
        .attr("stroke-width", d => d?.properties?.iso3 === iso3 ? 2.2 : 0.7);
}
function clearHighlight() {
    d3.selectAll(".country")
        .attr("opacity", 1)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.6);
    d3.selectAll("#lab9-cartogram path.feature")
        .attr("opacity", 1)
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.7);
}