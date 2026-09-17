d3.json("../data/lab6_assignment_gdp.json")
    .then(data => {

        // ============================================================
        // GLOBAL SETTINGS
        // ============================================================

        const TREEMAP_WIDTH = 1200;
        const TREEMAP_HEIGHT = 900;

        const tooltip =
            d3.select("#tooltip_lab6practice");


        // ============================================================
        // COLOR ENCODING: GDP STATUS
        // ============================================================

        const statusDomain = [
            "Increase",
            "Unchanged",
            "Decrease"
        ];

        const statusColor = d3.scaleOrdinal()
            .domain(statusDomain)
            .range([
                "#20ca71", // Increase
                "#f4ec86", // Unchanged
                "#f486e1"  // Decrease
            ]);


        // ============================================================
        // HELPERS
        // ============================================================

        function normalizeStatus(value) {

            const v = String(value || "")
                .trim()
                .toLowerCase();

            if (v === "increase") {
                return "Increase";
            }

            if (v === "decrease") {
                return "Decrease";
            }

            return "Unchanged";
        }


        function getStatus(d) {

            return normalizeStatus(
                d.data.gdp_status ||
                d.data.GDP_status ||
                d.data.status ||
                "Unchanged"
            );
        }


        function getGDP(d) {

            return (
                +d.data.gdp ||
                +d.data.GDP ||
                +d.data.value ||
                +d.value ||
                0
            );
        }


        function getCountry(d) {

            return d.data.name;
        }


        function getArea(d) {

            if (
                d.parent &&
                d.parent.depth === 2
            ) {
                return d.parent.data.name;
            }

            if (
                d.parent &&
                d.parent.depth === 1
            ) {
                return d.parent.data.name;
            }

            return "";
        }


        function getContinent(d) {

            let current = d;

            while (
                current.parent &&
                current.depth > 1
            ) {
                current = current.parent;
            }

            return current.data.name;
        }


        function formatGDP(value) {

            return d3.format(",")(value);
        }


        function buildHierarchy() {

            return d3.hierarchy(data)
                .sum(d =>
                    +d.gdp ||
                    +d.GDP ||
                    +d.value ||
                    0
                )
                .sort(
                    (a, b) =>
                        b.value - a.value
                );
        }


        // ============================================================
        // CHECK IF TEXT FITS INSIDE REGION
        // ============================================================

        function textFits(
            text,
            regionWidth,
            fontSize,
            horizontalPadding = 16
        ) {

            /*
             Approximate text width.

             0.58 works reasonably well for
             normal/bold browser fonts.
            */
            const estimatedWidth =
                text.length *
                fontSize *
                0.58;

            return (
                estimatedWidth +
                horizontalPadding
            ) < regionWidth;
        }


        // ============================================================
        // CONTINENT FONT SIZE
        // ============================================================

        function getContinentFontSize(
            d,
            isGraph2
        ) {
            const w =d.x1 - d.x0;

            const name =d.data.name;

            // Full size
            if (
                textFits(name,w,20,18)
            ) {
                return 20;
            }

            // Slightly smaller for
            // South America / Oceania / Africa
            if (
                textFits(name,w,16,14)
            ) {
                return 16;
            }
            if (
                isGraph2 &&
                textFits(name,w,13,10)
            ) {
                return 13;
            }
            return 15;
        }


        // ============================================================
        // DRAW ONE TREEMAP
        // ============================================================

        function createTreemap(
            containerSelector,
            title,
            tileMethod
        ) {

            const isGraph2 =
                containerSelector === "#treemap2";

            const root =
                buildHierarchy();


            // ========================================================
            // TREEMAP LAYOUT
            // ========================================================

            const treemapLayout =
                d3.treemap()
                    .tile(tileMethod)
                    .size([
                        TREEMAP_WIDTH,
                        TREEMAP_HEIGHT
                    ])
                    .round(true)

                    // More breathing room between countries
                    .paddingInner(d =>{
                         // root -> continents
                        if (d.depth === 0) {
                            return isGraph2
                                ? 8
                                : 8;
                        }

                        // continent -> areas
                        if (d.depth === 1) {
                            return isGraph2
                                ? 5
                                : 5;
                        }

                        // area -> countries
                        // countries in same area touch each other
                        if (d.depth === 2) {
                            return 0;
                        }
                        return 0;
                    }
                    )

                    // Small outside margin
                    .paddingOuter(3)                    

                    // Space reserved for parent labels
                    .paddingTop(d => {

                        // Continent
                        if (d.depth === 1) {
                            return isGraph2
                                ? 20
                                : 25;
                        }

                        // Area
                        if (d.depth === 2) {
                            return isGraph2
                                ? 10
                                : 15;
                        }

                        return 0;
                    });


            treemapLayout(root);


            // ========================================================
            // CONTAINER
            // ========================================================
            const container =
                d3.select(
                    containerSelector
                );

            container.html("");
            container
                .style(
                    "overflow-x",
                    "auto"
                );
            container
                .append("h3")
                .style(
                    "margin",
                    "0 0 12px 0"
                )
                .style(
                    "font-size",
                    "30px"
                )
                .style(
                    "font-weight",
                    "700"
                )
                .style(
                    "color",
                    "#5f55d9"
                )
                .text(title);


            // ========================================================
            // SVG
            // ========================================================

            const svg =
                container
                    .append("svg")
                    .attr(
                        "width",
                        TREEMAP_WIDTH
                    )
                    .attr(
                        "height",
                        TREEMAP_HEIGHT
                    )
                    .attr(
                        "viewBox",
                        `0 0 ${TREEMAP_WIDTH} ${TREEMAP_HEIGHT}`
                    )
                    .style(
                        "display",
                        "block"
                    )
                    .style(
                        "background",
                        "#f5f5f7"
                    )
                    .style(
                        "border-radius",
                        "18px"
                    );


            // ========================================================
            // COUNTRY CELLS
            // ========================================================

            const leaves =
                root.leaves();


            const cells =
                svg
                    .selectAll(".cell")
                    .data(leaves)
                    .join("g")
                    .attr(
                        "class",
                        "cell"
                    )
                    .attr(
                        "transform",
                        d =>
                            `translate(
                                ${d.x0},
                                ${d.y0}
                            )`
                    );


            // ========================================================
            // COUNTRY RECTANGLES
            // ========================================================

            cells
                .append("rect")
                .attr(
                    "width",
                    d =>
                        Math.max(
                            0,
                            d.x1 - d.x0
                        )
                )
                .attr(
                    "height",
                    d =>
                        Math.max(
                            0,
                            d.y1 - d.y0
                        )
                )
                .attr(
                    "rx",
                    d => {
                        const w =
                            d.x1 - d.x0;

                        const h =
                            d.y1 - d.y0;

                        return Math.min(
                            10,
                            w / 5,
                            h / 5
                        );
                    }
                )
                .attr(
                    "ry",
                    d => {

                        const w =
                            d.x1 - d.x0;

                        const h =
                            d.y1 - d.y0;

                        return Math.min(
                            10,
                            w / 5,
                            h / 5
                        );
                    }
                )
                .attr(
                    "fill",
                    d =>
                        statusColor(
                            getStatus(d)
                        )
                )
                .attr(
                    "stroke",
                    "#ffffff"
                )
                .attr(
                    "stroke-width",
                    1.5
                );


            // ========================================================
            // COUNTRY NAME
            // ========================================================

            cells
                .append("text")
                .attr(
                    "class",
                    "country-name"
                )
                .attr(
                    "x",
                    10
                )
                .attr(
                    "y",
                    21
                )
                .attr(
                    "fill",
                    "#222"
                )
                .attr(
                    "font-size",
                    "13px"
                )
                .attr(
                    "font-weight",
                    "600"
                )
                .attr(
                    "pointer-events",
                    "none"
                )
                .text(d => {

                    const w =
                        d.x1 - d.x0;

                    const h =
                        d.y1 - d.y0;

                    const name =
                        getCountry(d);

                    if (
                        h > 34 &&
                        textFits(
                            name,
                            w,
                            13,
                            20
                        )
                    ) {
                        return name;
                    }

                    return "";
                });


            // ========================================================
            // GDP NUMBER
            // ========================================================

            cells
                .append("text")
                .attr(
                    "class",
                    "gdp-number"
                )
                .attr(
                    "x",
                    10
                )
                .attr(
                    "y",
                    d => {

                        const h =
                            d.y1 - d.y0;

                        if (h > 150) {
                            return 70;
                        }

                        if (h > 100) {
                            return 58;
                        }

                        return 48;
                    }
                )
                .attr(
                    "fill",
                    "#111"
                )
                .attr(
                    "font-size",
                    d => {

                        const w =
                            d.x1 - d.x0;

                        const h =
                            d.y1 - d.y0;

                        if (
                            w > 250 &&
                            h > 160
                        ) {
                            return "36px";
                        }

                        if (
                            w > 180 &&
                            h > 110
                        ) {
                            return "27px";
                        }

                        return "20px";
                    }
                )
                .attr(
                    "font-weight",
                    "700"
                )
                .attr(
                    "pointer-events",
                    "none"
                )
                .text(d => {

                    const w =
                        d.x1 - d.x0;

                    const h =
                        d.y1 - d.y0;

                    const gdpText =
                        formatGDP(
                            getGDP(d)
                        );

                    // only show number when
                    // rectangle is large enough
                    if (
                        w > 145 &&
                        h > 82 &&
                        textFits(
                            gdpText,
                            w,
                            22,
                            20
                        )
                    ) {
                        return gdpText;
                    }

                    return "";
                });


            // ========================================================
            // AREA LABELS
            // ========================================================

            const areaNodes =
                root
                    .descendants()
                    .filter(
                        d =>
                            d.depth === 2
                    );


            svg
                .selectAll(
                    ".area-label"
                )
                .data(areaNodes)
                .join("text")
                .attr(
                    "class",
                    "area-label"
                )
                .attr(
                    "x",
                    d =>
                        d.x0 + 5
                )
                .attr(
                    "y",
                    d =>
                        d.y0 + 12
                )
                .attr(
                    "fill",
                    "#666"
                )
                .attr(
                    "font-size",
                    d => {

                        const w =
                            d.x1 - d.x0;

                        const name =
                            d.data.name;

                        if (
                            textFits(
                                name,
                                w,
                                12,
                                14
                            )
                        ) {
                            return "12px";
                        }

                        return "10px";
                    }
                )
                .attr(
                    "font-weight",
                    "600"
                )
                .attr(
                    "pointer-events",
                    "none"
                )
                .text(d => {

                    const w =
                        d.x1 - d.x0;

                    const h =
                        d.y1 - d.y0;

                    const name =
                        d.data.name;


                    // Try normal size
                    if (
                        h > 23 &&
                        textFits(
                            name,
                            w,
                            12,
                            14
                        )
                    ) {
                        return name;
                    }


                    // For Graph 2 allow slightly
                    // smaller font if it still fits
                    if (
                        isGraph2 &&
                        h > 21 &&
                        textFits(
                            name,
                            w,
                            10,
                            12
                        )
                    ) {
                        return name;
                    }


                    // Otherwise hide it.
                    // Tooltip still preserves hierarchy.
                    return "";
                });


            // ========================================================
            // CONTINENT LABELS
            // Draw last so labels appear above cells.
            // ========================================================

            const continentNodes =
                root.children || [];


            svg
                .selectAll(
                    ".continent-label"
                )
                .data(continentNodes)
                .join("text")
                .attr(
                    "class",
                    "continent-label"
                )
                .attr(
                    "x",
                    d =>
                        d.x0 + 6
                )
                .attr(
                    "y",
                    d =>
                        d.y0 + 21
                )
                .attr(
                    "fill",
                    "#333"
                )
                .attr(
                    "font-size",
                    d => {

                        const size =
                            getContinentFontSize(
                                d,
                                isGraph2
                            );

                        return `${size}px`;
                    }
                )
                .attr(
                    "font-weight",
                    "700"
                )
                .attr(
                    "pointer-events",
                    "none"
                )
                .text(d => {

                    const w =
                        d.x1 - d.x0;

                    const h =
                        d.y1 - d.y0;

                    const fontSize =
                        getContinentFontSize(
                            d,
                            isGraph2
                        );

                    if (
                        fontSize > 0 &&
                        h > 36
                    ) {
                        return d.data.name;
                    }

                    return "";
                });


            // ========================================================
            // TOOLTIP
            // ========================================================

            cells
                .on("mouseover",function(event, d){
                        tooltip
                            .style("opacity",1)
                            .html(`
                                <strong>${getCountry(d)}</strong><br>
                                Continent: ${getContinent(d)}<br>
                                Area: ${getArea(d)}<br>
                                GDP: ${formatGDP(getGDP(d))}<br>
                                GDP Status: ${getStatus(d)}
                            `);
                            
                        const group = d3.select(this)
                        const baseColor = statusColor(getStatus(d));
                        group.select("rect")
                            .attr(
                                "fill",
                                d3.color(baseColor).darker(0.3)
                            )
                        group.select(".country-name")
                            .attr("fill", "#142380")
                    }
                )
                .on(
                    "mousemove",
                    function(event) {

                        tooltip
                            .style(
                                "left",
                                `${
                                    event.pageX + 12
                                }px`
                            )
                            .style(
                                "top",
                                `${
                                    event.pageY + 12
                                }px`
                            );
                    }
                )
                .on(
                    "mouseleave",
                    function(event, d) {
                        tooltip
                            .style("opacity", 0);

                        const group = d3.select(this);

                        // restore original color
                        group
                            .select("rect")
                            .attr(
                                "fill",
                                statusColor(getStatus(d))
                            );

                        // restore text
                        group
                            .select(".country-name")
                            .attr("fill", "#222");

                        group
                            .select(".gdp-number")
                            .attr("fill", "#111");
                    }
                );
        }


        // ============================================================
        // DRAW TREEMAP 1
        // ============================================================

        createTreemap(
            "#treemap1",
            "Treemap 1: Squarify",
            d3.treemapSquarify
        );


        // ============================================================
        // DRAW TREEMAP 2
        // ============================================================

        createTreemap(
            "#treemap2",
            "Treemap 2: Binary",
            d3.treemapBinary
        );


        // ============================================================
        // LEGEND
        // ============================================================

        const legendContainer =
            d3.select(
                "#treemap-legend"
            );


        legendContainer.html("");


        legendContainer
            .style(
                "display",
                "flex"
            )
            .style(
                "align-items",
                "center"
            )
            .style(
                "gap",
                "20px"
            )
            .style(
                "flex-wrap",
                "wrap"
            )
            .style(
                "margin",
                "18px 0 28px 0"
            );


        legendContainer
            .append("span")
            .style(
                "font-weight",
                "700"
            )
            .style(
                "font-size",
                "16px"
            )
            .text(
                "GDP Status:"
            );


        const legend =
            legendContainer
                .selectAll(
                    ".legend-item"
                )
                .data(
                    statusDomain
                )
                .join("div")
                .attr(
                    "class",
                    "legend-item"
                )
                .style(
                    "display",
                    "flex"
                )
                .style(
                    "align-items",
                    "center"
                )
                .style(
                    "gap",
                    "8px"
                );


        legend
            .append("div")
            .style(
                "width",
                "16px"
            )
            .style(
                "height",
                "16px"
            )
            .style(
                "border-radius",
                "5px"
            )
            .style(
                "background-color",
                d =>
                    statusColor(d)
            );


        legend
            .append("span")
            .style(
                "font-size",
                "14px"
            )
            .text(
                d => d
            );

    })
    .catch(error => {

        console.error(
            "Error loading GDP JSON:",
            error
        );

    });