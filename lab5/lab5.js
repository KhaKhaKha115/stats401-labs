// Lab 5 assignment: urban transit network
// District → node / label color
// Station type → shape
// Passengers/day → symbol area
// Route type → link / matrix cell color
// Travel time → link width / matrix cell opacity
// Matrix is directed: row = origin, column = destination

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


    // ============================================================
    // Task 2 — Create node-link SVG
    // ============================================================

    const width = 1000;
    const height = 680;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("aria-label", "Urban transit node-link diagram");


    // ============================================================
    // Task 3 — Force simulation
    // ============================================================

    const simulation = d3.forceSimulation(nodes)
        .force(
            "link",
            d3.forceLink(links)
                .id(d => d.id)
                .distance(75)
        )
        .force(
            "charge",
            d3.forceManyBody()
                .strength(-180)
        )
        .force(
            "center",
            d3.forceCenter(
                width / 2,
                height / 2
            )
        )
        .force(
            "collision",
            d3.forceCollide()
                .radius(28)
        )
        .force(
            "x",
            d3.forceX(width / 2)
                .strength(0.025)
        )
        .force(
            "y",
            d3.forceY(height / 2)
                .strength(0.04)
        );


    // ============================================================
    // Task 4 — Links
    // ============================================================

    const link = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "route")
        .attr("opacity", 0.7);


    // ============================================================
    // Task 5 — Nodes
    // ============================================================

    const node = svg.append("g")
        .attr("class", "nodes")
        .selectAll("path")
        .data(nodes)
        .join("path")
        .attr("class", "node")
        .attr("tabindex", 0);


    // ============================================================
    // Passengers/day → symbol area
    // ============================================================

    const passengerAreaScale = d3.scaleLinear()
        .domain(
            d3.extent(
                nodes,
                d => d.daily_passengers
            )
        )
        .range([
            90,
            1200
        ]);


    // ============================================================
    // Station type → shape
    // ============================================================

    const stationSymbol = {
        Local: d3.symbolCircle,
        Transfer: d3.symbolSquare,
        Terminal: d3.symbolTriangle
    };

    const symbolGenerator = d3.symbol();

    node.attr(
        "d",
        d =>
            symbolGenerator
                .type(
                    stationSymbol[d.station_type]
                    || d3.symbolCircle
                )
                .size(
                    passengerAreaScale(
                        d.daily_passengers
                    )
                )()
    );


    // ============================================================
    // District → node color
    // ============================================================

    const districts = [
        "Central",
        "North",
        "South",
        "East",
        "West"
    ];

    const colorScale = d3.scaleOrdinal()
        .domain(districts)
        .range([
            "#C79A2B", // Central
            "#4C78A8", // North
            "#E45756", // South
            "#54A24B", // East
            "#8E6CBA"  // West
        ]);

    node
        .attr(
            "fill",
            d => colorScale(d.district)
        )
        .attr(
            "stroke",
            "#2f2f38"
        )
        .attr(
            "stroke-width",
            1.25
        );


    // ============================================================
    // Minutes → line width
    //
    // 2 min  = very thin
    // 9 min  = medium
    // 16 min = very thick
    // ============================================================

    const linkWidthScale = d3.scaleLinear()
        .domain([
            2,
            9,
            16
        ])
        .range([
            0.8,
            5,
            12
        ])
        .clamp(true);

    link.attr(
        "stroke-width",
        d =>
            linkWidthScale(
                d.travel_time_min
            )
    );


    // ============================================================
    // Route type → ONLY THREE color hues
    // ============================================================

    const routeTypes = [
        "Metro",
        "Express",
        "Shuttle"
    ];

    const linkColorScale = d3.scaleOrdinal()
        .domain(routeTypes)
        .range([
            "#78AEB8", // Metro
            "#D8A07C", // Express
            "#A89AC7"  // Shuttle
        ]);

    link.attr(
        "stroke",
        d =>
            linkColorScale(
                d.route_type
            )
    );


    // ============================================================
    // Labels
    // ============================================================

    const label = svg.append("g")
        .attr("class", "labels")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("class", "node-label")
        .attr(
            "dx",
            d =>
                Math.sqrt(
                    passengerAreaScale(
                        d.daily_passengers
                    ) / Math.PI
                ) + 6
        )
        .attr(
            "dy",
            4
        )
        .text(
            d => d.id
        );


    // ============================================================
    // Simulation tick
    // ============================================================

    simulation.on("tick", () => {

        nodes.forEach(d => {

            d.x = Math.max(
                28,
                Math.min(
                    width - 65,
                    d.x
                )
            );

            d.y = Math.max(
                28,
                Math.min(
                    height - 28,
                    d.y
                )
            );
        });


        link
            .attr(
                "x1",
                d => d.source.x
            )
            .attr(
                "y1",
                d => d.source.y
            )
            .attr(
                "x2",
                d => d.target.x
            )
            .attr(
                "y2",
                d => d.target.y
            );


        node.attr(
            "transform",
            d =>
                `translate(${d.x},${d.y})`
        );


        label
            .attr(
                "x",
                d => d.x
            )
            .attr(
                "y",
                d => d.y
            );
    });


    // ============================================================
    // Dragging
    // ============================================================

    function dragStarted(event, d) {

        if (!event.active) {
            simulation
                .alphaTarget(0.3)
                .restart();
        }

        d.fx = d.x;
        d.fy = d.y;
    }


    function dragged(event, d) {

        d.fx = Math.max(
            28,
            Math.min(
                width - 65,
                event.x
            )
        );

        d.fy = Math.max(
            28,
            Math.min(
                height - 28,
                event.y
            )
        );
    }


    function dragEnded(event, d) {

        if (!event.active) {
            simulation.alphaTarget(0);
        }

        d.fx = null;
        d.fy = null;
    }


    node.call(
        d3.drag()
            .on(
                "start",
                dragStarted
            )
            .on(
                "drag",
                dragged
            )
            .on(
                "end",
                dragEnded
            )
    );


    // ============================================================
    // Connected stations
    // ============================================================

    function isConnected(nodeA, nodeB) {

        return links.some(l =>
            (
                l.source.id === nodeA.id
                &&
                l.target.id === nodeB.id
            )
            ||
            (
                l.source.id === nodeB.id
                &&
                l.target.id === nodeA.id
            )
        );
    }


    // ============================================================
    // Node highlighting
    // ============================================================

    function highlight(event, d) {

        node.attr(
            "opacity",
            other =>
                other.id === d.id
                ||
                isConnected(
                    d,
                    other
                )
                    ? 1
                    : 0.15
        );


        label.attr(
            "opacity",
            other =>
                other.id === d.id
                ||
                isConnected(
                    d,
                    other
                )
                    ? 1
                    : 0.15
        );


        link.attr(
            "opacity",
            l =>
                l.source.id === d.id
                ||
                l.target.id === d.id
                    ? 1
                    : 0.08
        );
    }


    function restore() {

        node.attr(
            "opacity",
            1
        );

        label.attr(
            "opacity",
            1
        );

        link.attr(
            "opacity",
            0.7
        );
    }


    node
        .on(
            "mouseover",
            highlight
        )
        .on(
            "mouseout",
            restore
        )
        .on(
            "focus",
            highlight
        )
        .on(
            "blur",
            restore
        );


    // ============================================================
    // Tooltip
    // ============================================================

    const tooltip =
        d3.select(
            "#tooltip"
        );


    function stationText(d) {

        const degree =
            nodes.filter(
                other =>
                    isConnected(
                        d,
                        other
                    )
            ).length;


        return (
            `${d.station_name} (${d.id})\n`
            + `District: ${d.district}\n`
            + `Passengers/day: ${d3.format(",")(d.daily_passengers)}\n`
            + `Type: ${d.station_type}\n`
            + `Direct neighbors: ${degree}`
        );
    }


    function routeText(d) {

        return (
            `${d.source.station_name} → ${d.target.station_name}\n`
            + `${d.route_type} · ${d.travel_time_min} minutes`
        );
    }


    function showTooltip(
        event,
        text
    ) {

        tooltip
            .text(text)
            .style(
                "display",
                "block"
            )
            .style(
                "opacity",
                1
            );


        const bounds =
            event.currentTarget
                .getBoundingClientRect();


        const x =
            event.pageX
            ||
            bounds.right
            +
            window.scrollX;


        const y =
            event.pageY
            ||
            bounds.top
            +
            window.scrollY;


        const box =
            tooltip.node()
                .getBoundingClientRect();


        tooltip
            .style(
                "left",
                `${
                    Math.max(
                        window.scrollX + 4,
                        Math.min(
                            x + 10,
                            window.scrollX
                            + innerWidth
                            - box.width
                            - 12
                        )
                    )
                }px`
            )

            .style(
                "top",
                `${
                    Math.max(
                        window.scrollY + 4,
                        Math.min(
                            y + 10,
                            window.scrollY
                            + innerHeight
                            - box.height
                            - 12
                        )
                    )
                }px`
            );
    }


    function hideTooltip() {

        tooltip
            .style(
                "opacity",
                0
            )
            .style(
                "display",
                "none"
            );
    }


    node
        .attr(
            "aria-label",
            stationText
        )

        .on(
            "mouseover.tooltip",
            (event, d) =>
                showTooltip(
                    event,
                    stationText(d)
                )
        )

        .on(
            "mousemove.tooltip",
            (event, d) =>
                showTooltip(
                    event,
                    stationText(d)
                )
        )

        .on(
            "mouseout.tooltip",
            hideTooltip
        )

        .on(
            "focus.tooltip",
            (event, d) =>
                showTooltip(
                    event,
                    stationText(d)
                )
        )

        .on(
            "blur.tooltip",
            hideTooltip
        );


    link
        .on(
            "mouseover",
            (event, d) => {

                link.attr(
                    "opacity",
                    other =>
                        other === d
                            ? 1
                            : 0.08
                );


                node.attr(
                    "opacity",
                    other =>
                        other === d.source
                        ||
                        other === d.target
                            ? 1
                            : 0.15
                );


                label.attr(
                    "opacity",
                    other =>
                        other === d.source
                        ||
                        other === d.target
                            ? 1
                            : 0.15
                );


                showTooltip(
                    event,
                    routeText(d)
                );
            }
        )

        .on(
            "mousemove",
            (event, d) =>
                showTooltip(
                    event,
                    routeText(d)
                )
        )

        .on(
            "mouseout",
            () => {

                restore();

                hideTooltip();
            }
        );


    // ============================================================
    // Status
    // ============================================================

    const isolated =
        nodes.filter(
            d =>
                !nodes.some(
                    other =>
                        isConnected(
                            d,
                            other
                        )
                )
        );


    d3.select(
        "#status"
    )
        .text(
            `${nodes.length} stations · `
            + `${links.length} connections · `
            + `${isolated.length} isolated stations`
        );


    // ============================================================
    // Build DIRECTED adjacency matrix
    //
    // row = origin/source
    // column = destination/target
    // ============================================================

    const matrixData = [];


    nodes.forEach(
        rowNode => {

            nodes.forEach(
                colNode => {

                    const foundLink =
                        links.find(
                            l =>
                                l.source.id
                                    === rowNode.id
                                &&
                                l.target.id
                                    === colNode.id
                        );


                    matrixData.push({

                        row:
                            rowNode.id,

                        col:
                            colNode.id,

                        travel_time_min:
                            foundLink
                                ? foundLink.travel_time_min
                                : 0,

                        route_type:
                            foundLink
                                ? foundLink.route_type
                                : null,

                        route:
                            foundLink
                    });
                }
            );
        }
    );


    // ============================================================
    // Matrix scales
    // ============================================================

    const matrixSize =
        800;


    const matrixX =
        d3.scaleBand()
            .range([
                0,
                matrixSize
            ])
            .padding(
                0.06
            );


    const matrixY =
        d3.scaleBand()
            .range([
                0,
                matrixSize
            ])
            .padding(
                0.06
            );


    // ============================================================
    // Minutes → matrix cell opacity
    //
    // IMPORTANT:
    // Hue still ONLY represents route type.
    //
    // 2 min  = lighter
    // 9 min  = medium
    // 16 min = dark / fully opaque
    // ============================================================

    const opacityScale =
        d3.scaleLinear()
            .domain([
                2,
                9,
                16
            ])
            .range([
                0.35,
                0.68,
                1
            ])
            .clamp(true);


    // ============================================================
    // Matrix SVG
    // ============================================================

    const matrixSvg =
        d3.select(
            "#matrix"
        )
            .append(
                "svg"
            )
            .attr(
                "width",
                940
            )
            .attr(
                "height",
                940
            )
            .attr(
                "aria-label",
                "Station adjacency matrix"
            );


    const matrixGroup =
        matrixSvg.append(
            "g"
        )
            .attr(
                "transform",
                "translate(100,100)"
            );


    // ============================================================
    // Matrix cells
    //
    // Color hue = route type
    // Opacity = travel time
    // ============================================================

    const cells =
        matrixGroup.append(
            "g"
        )
            .selectAll(
                "rect"
            )
            .data(
                matrixData
            )
            .join(
                "rect"
            )
            .attr(
                "class",
                "matrix-cell"
            )
            .attr(
                "fill",
                d =>
                    d.route
                        ? linkColorScale(
                            d.route_type
                        )
                        : "#f0eef4"
            )
            .attr(
                "fill-opacity",
                d =>
                    d.route
                        ? opacityScale(
                            d.travel_time_min
                        )
                        : 1
            );


    // ============================================================
    // Hover rulers
    //
    // No border.
    // Very light transparent highlight.
    // ============================================================

    const rowRuler =
        matrixGroup.append(
            "rect"
        )
            .attr(
                "class",
                "matrix-ruler"
            )
            .attr(
                "fill",
                "#6a5acd"
            )
            .attr(
                "fill-opacity",
                0
            )
            .attr(
                "pointer-events",
                "none"
            );


    const colRuler =
        matrixGroup.append(
            "rect"
        )
            .attr(
                "class",
                "matrix-ruler"
            )
            .attr(
                "fill",
                "#6a5acd"
            )
            .attr(
                "fill-opacity",
                0
            )
            .attr(
                "pointer-events",
                "none"
            );


    // ============================================================
    // Station lookup
    // ============================================================

    function getStationById(id) {

        return nodes.find(
            station =>
                station.id === id
        );
    }


    // ============================================================
    // Matrix tooltip
    // ============================================================

    function matrixTooltipText(d) {

        const rowStation =
            getStationById(
                d.row
            );


        const colStation =
            getStationById(
                d.col
            );


        const rowName =
            rowStation
                ? `${rowStation.station_name} (${rowStation.id})`
                : d.row;


        const colName =
            colStation
                ? `${colStation.station_name} (${colStation.id})`
                : d.col;


        if (
            d.route
        ) {

            return (
                `${rowName} → ${colName}\n`
                + `${d.route_type} · ${d.travel_time_min} minutes`
            );
        }


        return (
            `${rowName} → ${colName}\n`
            + `No direct route`
        );
    }


    // ============================================================
    // Matrix hover
    // ============================================================

    cells

        .on(
            "mouseover",
            (event, d) => {

                // Horizontal row ruler
                rowRuler
                    .attr(
                        "x",
                        0
                    )
                    .attr(
                        "y",
                        matrixY(
                            d.row
                        )
                    )
                    .attr(
                        "width",
                        matrixSize
                    )
                    .attr(
                        "height",
                        matrixY.bandwidth()
                    )
                    .attr(
                        "fill-opacity",
                        0.10
                    );


                // Vertical column ruler
                colRuler
                    .attr(
                        "x",
                        matrixX(
                            d.col
                        )
                    )
                    .attr(
                        "y",
                        0
                    )
                    .attr(
                        "width",
                        matrixX.bandwidth()
                    )
                    .attr(
                        "height",
                        matrixSize
                    )
                    .attr(
                        "fill-opacity",
                        0.10
                    );


                showTooltip(
                    event,
                    matrixTooltipText(
                        d
                    )
                );
            }
        )


        .on(
            "mousemove",
            (event, d) => {

                showTooltip(
                    event,
                    matrixTooltipText(
                        d
                    )
                );
            }
        )


        .on(
            "mouseout",
            () => {

                rowRuler.attr(
                    "fill-opacity",
                    0
                );

                colRuler.attr(
                    "fill-opacity",
                    0
                );

                hideTooltip();
            }
        );


    // ============================================================
    // Matrix row labels
    // ============================================================

    const rowLabels =
        matrixGroup.append(
            "g"
        )
            .selectAll(
                "text"
            )
            .data(
                nodes
            )
            .join(
                "text"
            )
            .attr(
                "class",
                "matrix-label"
            )
            .attr(
                "x",
                -8
            )
            .attr(
                "dy",
                "0.35em"
            )
            .attr(
                "text-anchor",
                "end"
            );


    // ============================================================
    // Matrix column labels
    // ============================================================

    const colLabels =
        matrixGroup.append(
            "g"
        )
            .selectAll(
                "text"
            )
            .data(
                nodes
            )
            .join(
                "text"
            )
            .attr(
                "class",
                "matrix-label"
            )
            .attr(
                "text-anchor",
                "start"
            );


    // ============================================================
    // District color on matrix labels
    // ============================================================

    [
        rowLabels,
        colLabels
    ].forEach(
        labels => {

            labels
                .text(
                    d => d.id
                )
                .attr(
                    "fill",
                    d =>
                        colorScale(
                            d.district
                        )
                )
                .attr(
                    "font-weight",
                    700
                )
                .on(
                    "mouseover",
                    (event, d) =>
                        showTooltip(
                            event,
                            stationText(
                                d
                            )
                        )
                )
                .on(
                    "mouseout",
                    hideTooltip
                );
        }
    );


    // ============================================================
    // Matrix axis titles
    // ============================================================

    matrixSvg.append(
        "text"
    )
        .attr(
            "x",
            500
        )
        .attr(
            "y",
            25
        )
        .attr(
            "text-anchor",
            "middle"
        )
        .text(
            "Destination station"
        );


    matrixSvg.append(
        "text"
    )
        .attr(
            "transform",
            "translate(20,500) rotate(-90)"
        )
        .attr(
            "text-anchor",
            "middle"
        )
        .text(
            "Origin station"
        );


    // ============================================================
    // Matrix reorder
    // ============================================================

    function orderMatrix(order) {

        const stationTypes = [
            "Local",
            "Transfer",
            "Terminal"
        ];


        const ordered =
            [...nodes].sort(
                (a, b) => {

                    let category =
                        0;


                    if (
                        order ===
                        "district"
                    ) {

                        category =
                            districts.indexOf(
                                a.district
                            )
                            -
                            districts.indexOf(
                                b.district
                            );
                    }


                    if (
                        order ===
                        "station_type"
                    ) {

                        category =
                            stationTypes.indexOf(
                                a.station_type
                            )
                            -
                            stationTypes.indexOf(
                                b.station_type
                            );
                    }


                    return (
                        category
                        ||
                        +a.id.slice(
                            1
                        )
                        -
                        +b.id.slice(
                            1
                        )
                    );
                }
            );


        matrixX.domain(
            ordered.map(
                d => d.id
            )
        );


        matrixY.domain(
            ordered.map(
                d => d.id
            )
        );


        cells
            .attr(
                "x",
                d =>
                    matrixX(
                        d.col
                    )
            )
            .attr(
                "y",
                d =>
                    matrixY(
                        d.row
                    )
            )
            .attr(
                "width",
                matrixX.bandwidth()
            )
            .attr(
                "height",
                matrixY.bandwidth()
            );


        rowLabels.attr(
            "y",
            d =>
                matrixY(
                    d.id
                )
                +
                matrixY.bandwidth()
                / 2
        );


        colLabels.attr(
            "transform",
            d =>
                `translate(${
                    matrixX(
                        d.id
                    )
                    +
                    matrixX.bandwidth()
                    / 2
                },-8) rotate(-60)`
        );
    }


    // Default matrix ordering
    orderMatrix(
        "district"
    );


    d3.select(
        "#matrix-order"
    )
        .on(
            "change",
            event =>
                orderMatrix(
                    event.target.value
                )
        );


    // ============================================================
    // Legend helper
    // ============================================================

    function addLegend(
        title,
        values,
        drawSymbol
    ) {

        const group =
            d3.select(
                "#legend"
            )
                .append(
                    "div"
                )
                .attr(
                    "class",
                    "legend-group"
                );


        group.append(
            "strong"
        )
            .text(
                title
            );


        values.forEach(
            value => {

                const item =
                    group.append(
                        "span"
                    )
                        .attr(
                            "class",
                            "legend-item"
                        );


                const icon =
                    item.append(
                        "svg"
                    )
                        .attr(
                            "width",
                            48
                        )
                        .attr(
                            "height",
                            48
                        )
                        .attr(
                            "aria-hidden",
                            "true"
                        );


                drawSymbol(
                    icon,
                    value
                );


                item.append(
                    "span"
                )
                    .text(
                        value
                    );
            }
        );
    }


    // ============================================================
    // District legend
    // ============================================================

    addLegend(
        "District → node / label color",
        districts,

        (icon, value) => {

            icon.append(
                "circle"
            )
                .attr(
                    "cx",
                    24
                )
                .attr(
                    "cy",
                    24
                )
                .attr(
                    "r",
                    8
                )
                .attr(
                    "fill",
                    colorScale(
                        value
                    )
                );
        }
    );


    // ============================================================
    // Station type legend
    // ============================================================

    addLegend(
        "Station type → shape",

        [
            "Local",
            "Transfer",
            "Terminal"
        ],

        (icon, value) => {

            icon.append(
                "path"
            )
                .attr(
                    "transform",
                    "translate(24,24)"
                )
                .attr(
                    "d",
                    d3.symbol()
                        .type(
                            stationSymbol[
                                value
                            ]
                        )
                        .size(
                            260
                        )()
                )
                .attr(
                    "fill",
                    "#eeeaf7"
                )
                .attr(
                    "stroke",
                    "#302a40"
                )
                .attr(
                    "stroke-width",
                    1.25
                );
        }
    );


    // ============================================================
    // Passenger volume legend
    // ============================================================

    addLegend(
        "Passengers/day → symbol area",

        [
            2000,
            6000,
            9850
        ],

        (icon, value) => {

            icon.append(
                "path"
            )
                .attr(
                    "transform",
                    "translate(24,24)"
                )
                .attr(
                    "d",
                    d3.symbol()
                        .type(
                            d3.symbolCircle
                        )
                        .size(
                            passengerAreaScale(
                                value
                            )
                        )()
                )
                .attr(
                    "fill",
                    "#aaa1c8"
                );
        }
    );


    // ============================================================
    // Route type legend
    //
    // ONLY THREE COLORS
    // ============================================================

    addLegend(
        "Route type → link / cell color",
        routeTypes,

        (icon, value) => {

            icon.append(
                "line"
            )
                .attr(
                    "x1",
                    3
                )
                .attr(
                    "x2",
                    45
                )
                .attr(
                    "y1",
                    24
                )
                .attr(
                    "y2",
                    24
                )
                .attr(
                    "stroke",
                    linkColorScale(
                        value
                    )
                )
                .attr(
                    "stroke-width",
                    5
                );
        }
    );


    // ============================================================
    // Minutes legend
    //
    // Line width = node-link
    // Cell opacity = adjacency matrix
    // ============================================================

    addLegend(
        "Minutes → line width / cell opacity",

        [
            2,
            9,
            16
        ],

        (icon, value) => {

            // Node-link example
            icon.append(
                "line"
            )
                .attr(
                    "x1",
                    1
                )
                .attr(
                    "x2",
                    25
                )
                .attr(
                    "y1",
                    24
                )
                .attr(
                    "y2",
                    24
                )
                .attr(
                    "stroke",
                    "#555"
                )
                .attr(
                    "stroke-width",
                    linkWidthScale(
                        value
                    )
                );


            // Matrix opacity example
            icon.append(
                "rect"
            )
                .attr(
                    "x",
                    31
                )
                .attr(
                    "y",
                    16
                )
                .attr(
                    "width",
                    15
                )
                .attr(
                    "height",
                    15
                )
                .attr(
                    "fill",
                    "#555"
                )
                .attr(
                    "fill-opacity",
                    opacityScale(
                        value
                    )
                );
        }
    );


}).catch(error => {

    d3.select(
        "#status"
    )
        .attr(
            "class",
            "chart-error"
        )
        .text(
            `Unable to load Lab 5: ${error.message}. `
            + `Open this page through a local HTTP server.`
        );


    console.error(
        error
    );
});