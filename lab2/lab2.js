const width = 800;
const height = 500;

const margin = {
    top: 70,
    right: 170,
    bottom: 70,
    left: 70
};

d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
}))
.then(data => {
    console.log(data);
    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.temp_c)) 
        .nice()
        .range([
            margin.left,
            width - margin.right
        ]);
    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.population))
        .nice()
        .range([
            height - margin.bottom,
            margin.top
        ]);
    
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    svg.append("g")
        .attr(
            "transform",
            `translate(0,${height - margin.bottom})`
        ).call(d3.axisBottom(xScale))
    
    svg.append("g")
        .attr(
            "transform",
            `translate(${margin.left}, 0)`
        )
        .call(d3.axisLeft(yScale));
    
    // Add the x-axis label at the bottom center.
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 20)
        .attr("text-anchor", "middle")
        .text("Temperature");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .text("Population (by million)");
    
    const colorScale = d3.scaleOrdinal()
        .domain(["Low", "Medium", "High"])
         .range([ "#E396F3",
                "#CA36E7",
                "#7136E7"]);

    const regionLetter = d3.scaleOrdinal()
    .domain(["North", "South", "East", "West"])
    .range(["N", "S", "E", "W"]);

    // Create one group for each city
    const cityGroups = svg.selectAll(".city")
        .data(data)
        .join("g")
        .attr("class", "city")
        .attr("transform", d =>
            `translate(${xScale(d.temp_c)}, ${yScale(d.population)})`
        );

    // Draw the circle
    cityGroups.append("circle")
        .attr("r", 15)
        .attr("fill", d => colorScale(d.development_level))
        .attr("stroke", "#333")
        .attr("stroke-width", 1);

    // Add N / S / E / W inside the circle
    cityGroups.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("font-weight", "light")
        .style("fill", "white")
        .text(d => regionLetter(d.region));


    //Add Developmen level legend
    const developmentLevels = ["Low", "Medium", "High"];
    const legend = svg.append("g")
    .attr(
        "transform",
        `translate(${width - margin.right + 25}, 60)`
    );
    const legendItems = legend
        .selectAll(".legend-item")
        .data(developmentLevels)
        .join("g")
        .attr("class", "legend-item")
        .attr(
            "transform",
            (d, i) => `translate(0, ${i * 28})`
        );
    legendItems.append("circle")
        .attr("r", 6)
        .attr("fill", d => colorScale(d));
    legendItems.append("text")
        .attr("x", 12)
        .attr("y", 4)
        .text(d => d);

    // Region legend
    const regions = [
        { letter: "N", label: "North" },
        { letter: "S", label: "South" },
        { letter: "E", label: "East" },
        { letter: "W", label: "West" }
    ];

    const regionLegend = svg.append("g")
        .attr(
            "transform",
            `translate(${width - margin.right + 25}, 170)`
        );

    const regionItems = regionLegend
        .selectAll(".region-item")
        .data(regions)
        .join("g")
        .attr("class", "region-item")
        .attr(
            "transform",
            (d, i) => `translate(0, ${i * 28})`
        );

    regionItems.append("circle")
        .attr("r", 10)
        .attr("fill", "#eee")
        .attr("stroke", "#555");

    regionItems.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 4)
        .style("font-size", "10px")
        .text(d => d.letter);

    regionItems.append("text")
        .attr("x", 18)
        .attr("y", 4)
        .text(d => d.label);

    //Create tooltip --> inspect circle
    const tooltip = d3.select("#tooltip");
    svg.selectAll("circle")
    .on("mouseover", function(event, d) {
        tooltip
            .style("opacity", 1)
            .html(`
                <span style="font-size: 20px; border-bottom: 1px solid SlateBlue; margin-bottom: 2px;display: inline-block;">
                    ${d.city}
                </span><br>
                Temperature: ${d.temp_c}<br>
                Population: ${d.population} million<br>
                Development Level: ${d.development_level}<br>
                Region: ${d.region}
            `);
    })
    .on("mousemove", function(event) {
        tooltip
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY + 10}px`);
    })
    .on("mouseout", function() {
        tooltip
            .style("opacity", 0);

    });

    // Add graph title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 25)
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "bold")
        .style("fill", "black")
        .text("City Population and Temperature by Development Level and Region");

}).catch(error => {
    console.error("Error loading data:", error);
});