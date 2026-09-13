// Lab 5 assignment: adapt tutorial Tasks 1–16 to the urban transit data.
// district replaces group; daily_passengers replaces activity_count;
// station_type is the third node attribute; travel_time_min and route_type
// replace the tutorial's weight and type. All connections are undirected.

// Task 1 — Load both external CSV files and convert numeric columns.
Promise.all([
    d3.csv("../data/lab5_assignment_stations.csv", d => ({
        id: d.id,
        station_name: d.station_name,
        district: d.district,
        daily_passengers: +d.daily_passengers,
        station_type: d.station_type
    })),
    d3.csv("../data/lab5_assignment_routes.csv", d => ({
        source: d.source,
        target: d.target,
        travel_time_min: +d.travel_time_min,
        route_type: d.route_type
    }))
]).then(([nodes, links]) => {
    // Task 2 — Create the SVG.
    const width = 1000;
    const height = 680;
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("aria-label", "Urban transit node-link diagram");

    // Task 3 — Link, charge, center, and collision forces.
    // forceLink changes source and target IDs into references to node objects.
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(75))
        .force("charge", d3.forceManyBody().strength(-180))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(28))
        // Gentle extra forces keep isolated stations within the drawing.
        .force("x", d3.forceX(width / 2).strength(0.025))
        .force("y", d3.forceY(height / 2).strength(0.04));

    // Task 4 — Draw links first, so nodes appear above them.
    const link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "route")
        .attr("opacity", 0.6);

    // Task 5 — Draw one circle for each station.
    const node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("class", "node")
        .attr("tabindex", 0);

    // Task 6 — Update positions on each tick (labels are added in Task 11).
    simulation.on("tick", () => {
        nodes.forEach(d => {
            d.x = Math.max(28, Math.min(width - 65, d.x));
            d.y = Math.max(28, Math.min(height - 28, d.y));
        });
        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node.attr("cx", d => d.x).attr("cy", d => d.y);
        label.attr("x", d => d.x).attr("y", d => d.y);
    });

    // Task 7 — Passenger volume determines node size.
    // With a zero-based square-root radius, circle area is proportional to volume.
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(nodes, d => d.daily_passengers)])
        .range([0, 19]);
    node.attr("r", d => sizeScale(d.daily_passengers));

    // Task 8 — District determines node color.
    const districts = ["Central", "North", "South", "East", "West"];
    const colorScale = d3.scaleOrdinal()
        .domain(districts)
        .range(d3.schemeTableau10);
    node.attr("fill", d => colorScale(d.district));

    // Assignment extension — Encode station type using the circle border.
    node.attr("stroke", "#302a40")
        .attr("stroke-width", d => d.station_type === "Transfer" ? 4 : 1.5)
        .attr("stroke-dasharray", d => d.station_type === "Terminal" ? "3,2" : null);

    // Task 9 — Longer travel times produce thicker lines (greater time cost).
    const linkWidthScale = d3.scaleLinear()
        .domain(d3.extent(links, d => d.travel_time_min))
        .range([1.5, 6]);
    link.attr("stroke-width", d => linkWidthScale(d.travel_time_min));

    // Task 10 — Route type determines link color.
    const routeTypes = ["Metro", "Express", "Shuttle"];
    const linkColorScale = d3.scaleOrdinal()
        .domain(routeTypes)
        .range(["#167d8d", "#b84e19", "#7854a3"]);
    link.attr("stroke", d => linkColorScale(d.route_type));

    // Task 11 — Short IDs keep 50 labels readable; tooltips show full names.
    const label = svg.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("class", "node-label")
        .attr("dx", d => sizeScale(d.daily_passengers) + 5)
        .attr("dy", 4)
        .text(d => d.id);

    // Task 12 — Dragging, using the tutorial's three named functions.
    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = Math.max(28, Math.min(width - 65, event.x));
        d.fy = Math.max(28, Math.min(height - 28, event.y));
    }
    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    node.call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded));

    // Task 13 — Find neighbors in either direction, as in the tutorial.
    function isConnected(nodeA, nodeB) {
        return links.some(l =>
            (l.source.id === nodeA.id && l.target.id === nodeB.id) ||
            (l.source.id === nodeB.id && l.target.id === nodeA.id));
    }
    function highlight(event, d) {
        node.attr("opacity", other => other.id === d.id || isConnected(d, other) ? 1 : 0.15);
        label.attr("opacity", other => other.id === d.id || isConnected(d, other) ? 1 : 0.15);
        link.attr("opacity", l => l.source.id === d.id || l.target.id === d.id ? 1 : 0.1);
    }
    function restore() {
        node.attr("opacity", 1);
        label.attr("opacity", 1);
        link.attr("opacity", 0.6);
    }
    node.on("mouseover", highlight).on("mouseout", restore)
        .on("focus", highlight).on("blur", restore);

    // Task 14 — Namespaced tooltip events coexist with highlighting events.
    const tooltip = d3.select("#tooltip");
    function stationText(d) {
        const degree = nodes.filter(other => isConnected(d, other)).length;
        return `${d.station_name} (${d.id})\nDistrict: ${d.district}\nPassengers/day: ${d3.format(",")(d.daily_passengers)}\nType: ${d.station_type}\nDirect neighbors: ${degree}`;
    }
    function routeText(d) {
        return `${d.source.station_name} ↔ ${d.target.station_name}\n${d.route_type} · ${d.travel_time_min} minutes`;
    }
    function showTooltip(event, text) {
        tooltip.text(text).style("display", "block").style("opacity", 1);
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.pageX || bounds.right + window.scrollX;
        const y = event.pageY || bounds.top + window.scrollY;
        const box = tooltip.node().getBoundingClientRect();
        tooltip.style("left", `${Math.max(window.scrollX + 4, Math.min(x + 10, window.scrollX + innerWidth - box.width - 12))}px`)
            .style("top", `${Math.max(window.scrollY + 4, Math.min(y + 10, window.scrollY + innerHeight - box.height - 12))}px`);
    }
    function hideTooltip() {
        tooltip.style("opacity", 0).style("display", "none");
    }
    node.attr("aria-label", stationText)
        .on("mouseover.tooltip", (event, d) => showTooltip(event, stationText(d)))
        .on("mousemove.tooltip", (event, d) => showTooltip(event, stationText(d)))
        .on("mouseout.tooltip", hideTooltip)
        .on("focus.tooltip", (event, d) => showTooltip(event, stationText(d)))
        .on("blur.tooltip", hideTooltip);
    link.on("mouseover", (event, d) => {
        link.attr("opacity", other => other === d ? 1 : 0.1);
        node.attr("opacity", other => other === d.source || other === d.target ? 1 : 0.15);
        label.attr("opacity", other => other === d.source || other === d.target ? 1 : 0.15);
        showTooltip(event, routeText(d));
    }).on("mousemove", (event, d) => showTooltip(event, routeText(d)))
        .on("mouseout", () => { restore(); hideTooltip(); });

    // Task 15 — All data-dependent code stays inside this Promise.all callback.
    const isolated = nodes.filter(d => !nodes.some(other => isConnected(d, other)));
    d3.select("#status").text(`${nodes.length} stations · ${links.length} connections · ${isolated.length} isolated stations`);

    // Task 16.1 — Create every row/column pair using nested loops and find().
    const matrixData = [];
    nodes.forEach(rowNode => {
        nodes.forEach(colNode => {
            const foundLink = links.find(l =>
                (l.source.id === rowNode.id && l.target.id === colNode.id) ||
                (l.source.id === colNode.id && l.target.id === rowNode.id));
            matrixData.push({
                row: rowNode.id,
                col: colNode.id,
                travel_time_min: foundLink ? foundLink.travel_time_min : 0,
                route_type: foundLink ? foundLink.route_type : null,
                route: foundLink
            });
        });
    });

    // Task 16.2 — Band scales position the stations on both axes.
    const matrixSize = 800;
    const matrixX = d3.scaleBand().range([0, matrixSize]).padding(0.06);
    const matrixY = d3.scaleBand().range([0, matrixSize]).padding(0.06);

    // Tasks 16.3–16.4 — Cell color shows service; opacity shows travel time.
    const opacityScale = d3.scaleLinear()
        .domain(d3.extent(links, d => d.travel_time_min))
        .range([0.25, 1]);
    const matrixSvg = d3.select("#matrix").append("svg")
        .attr("width", 940).attr("height", 940)
        .attr("aria-label", "Station adjacency matrix");
    const matrixGroup = matrixSvg.append("g").attr("transform", "translate(100,100)");
    const cells = matrixGroup.append("g").selectAll("rect")
        .data(matrixData).join("rect")
        .attr("class", "matrix-cell")
        .attr("fill", d => d.route ? linkColorScale(d.route_type) : "#f0eef4")
        .attr("fill-opacity", d => d.route ? opacityScale(d.travel_time_min) : 1)
        .on("mouseover", (event, d) => showTooltip(event, d.route ? routeText(d.route)
            : `${d.row} ↔ ${d.col}\nNo direct connection`))
        .on("mouseout", hideTooltip);

    // Assignment extension — Colored labels preserve district membership.
    const rowLabels = matrixGroup.append("g").selectAll("text")
        .data(nodes).join("text").attr("class", "matrix-label")
        .attr("x", -8).attr("dy", "0.35em").attr("text-anchor", "end");
    const colLabels = matrixGroup.append("g").selectAll("text")
        .data(nodes).join("text").attr("class", "matrix-label")
        .attr("text-anchor", "start");
    [rowLabels, colLabels].forEach(labels => {
        labels.text(d => d.id).attr("fill", d => colorScale(d.district))
            .attr("font-weight", 700)
            .on("mouseover", (event, d) => showTooltip(event, stationText(d)))
            .on("mouseout", hideTooltip);
    });
    matrixSvg.append("text").attr("x", 500).attr("y", 25)
        .attr("text-anchor", "middle").text("Destination station");
    matrixSvg.append("text").attr("transform", "translate(20,500) rotate(-90)")
        .attr("text-anchor", "middle").text("Origin station");

    // Assignment extension — Reorder both axes together without changing data.
    function orderMatrix(order) {
        const stationTypes = ["Local", "Transfer", "Terminal"];
        const ordered = [...nodes].sort((a, b) => {
            let category = 0;
            if (order === "district") category = districts.indexOf(a.district) - districts.indexOf(b.district);
            if (order === "station_type") category = stationTypes.indexOf(a.station_type) - stationTypes.indexOf(b.station_type);
            return category || +a.id.slice(1) - +b.id.slice(1);
        });
        matrixX.domain(ordered.map(d => d.id));
        matrixY.domain(ordered.map(d => d.id));
        cells.attr("x", d => matrixX(d.col)).attr("y", d => matrixY(d.row))
            .attr("width", matrixX.bandwidth()).attr("height", matrixY.bandwidth());
        rowLabels.attr("y", d => matrixY(d.id) + matrixY.bandwidth() / 2);
        colLabels.attr("transform", d => `translate(${matrixX(d.id) + matrixX.bandwidth() / 2},-8) rotate(-60)`);
    }
    orderMatrix("district");
    d3.select("#matrix-order").on("change", event => orderMatrix(event.target.value));

    // Assignment requirement — Legends use the same scales as the charts.
    function addLegend(title, values, drawSymbol) {
        const group = d3.select("#legend").append("div").attr("class", "legend-group");
        group.append("strong").text(title);
        values.forEach(value => {
            const item = group.append("span").attr("class", "legend-item");
            const icon = item.append("svg").attr("width", 42).attr("height", 42).attr("aria-hidden", "true");
            drawSymbol(icon, value);
            item.append("span").text(value);
        });
    }
    addLegend("District → circle / label color", districts, (icon, value) => {
        icon.append("circle").attr("cx", 21).attr("cy", 21).attr("r", 8).attr("fill", colorScale(value));
    });
    addLegend("Station type → border", ["Local", "Transfer", "Terminal"], (icon, value) => {
        icon.append("circle").attr("cx", 21).attr("cy", 21).attr("r", 10)
            .attr("fill", "#eeeaf7").attr("stroke", "#302a40")
            .attr("stroke-width", value === "Transfer" ? 4 : 1.5)
            .attr("stroke-dasharray", value === "Terminal" ? "3,2" : null);
    });
    addLegend("Passengers/day → circle area", [2000, 6000, 9850], (icon, value) => {
        icon.append("circle").attr("cx", 21).attr("cy", 21).attr("r", sizeScale(value)).attr("fill", "#aaa1c8");
    });
    addLegend("Route type → link / cell color", routeTypes, (icon, value) => {
        icon.append("line").attr("x1", 2).attr("x2", 40).attr("y1", 21).attr("y2", 21)
            .attr("stroke", linkColorScale(value)).attr("stroke-width", 4);
    });
    addLegend("Minutes → line width / cell opacity", [2, 9, 16], (icon, value) => {
        icon.append("line").attr("x1", 1).attr("x2", 24).attr("y1", 21).attr("y2", 21)
            .attr("stroke", "#555").attr("stroke-width", linkWidthScale(value));
        icon.append("rect").attr("x", 28).attr("y", 14).attr("width", 14).attr("height", 14)
            .attr("fill", "#555").attr("fill-opacity", opacityScale(value));
    });
}).catch(error => {
    d3.select("#status").attr("class", "chart-error")
        .text(`Unable to load Lab 5: ${error.message}. Open this page through a local HTTP server.`);
    console.error(error);
});
