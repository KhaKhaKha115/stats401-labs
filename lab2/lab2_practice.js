const width = 800;
const height = 500;

const margin = {
    top: 40,
    right: 170,
    bottom: 70,
    left: 70
};

d3.csv("../data/students_multivariate.csv", d => ({
    name: d.name,
    study_hours: +d.study_hours,
    score: +d.score,
    major: d.major,
    year: d.year
}))
.then(data => {
    console.log(data);
    // Create X scale based on study_hours
    // Extend return min, max; domain is range of real data = input/data values
    // nice help domain become nice number on axis
    // range is output placement pixel on SVG = output/pixel positions
    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.study_hours)) 
        .nice()
        .range([
            margin.left,
            width - margin.right
        ]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.score))
        .nice()
        .range([
            height - margin.bottom,
            margin.top
        ]);

    //Create svg
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    //Draw X axis at the bottom of SVG
    // Create the x-axis with <g></g>, move it to the bottom of the chart by translate,
    // and use xScale to decide the tick values and positions.
    svg.append("g")
        .attr(
            "transform",
            `translate(0,${height - margin.bottom})`
        ).call(d3.axisBottom(xScale))

    //Draw Y axis
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
        .text("Study Hours");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .text("Exam Score");


/* selectAll = select the elements, data = connect data
join = create one circle for each data row
cx = x position, cy = y position
r = circle size, fill = circle color
<circle cx="300" cy="200" r="7"></circle> 
selectAll → data → join = loop create numbers of circles based on data
*/
    svg.selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", d => xScale(d.study_hours))
    .attr("cy", d => yScale(d.score))
    .attr("r", 7)
    .attr("fill", "steelblue");

    //Color matching by major
    const majors = Array.from(
        new Set(data.map(d => d.major))
    );

    const colorScale = d3.scaleOrdinal()
        .domain(majors)
        .range(d3.schemeTableau10);

    svg.selectAll("circle")
        .attr("fill", d => colorScale(d.major))

    //Circle size based on year of study
    const sizeScale = d3.scaleOrdinal()
    .domain([
        "Freshman",
        "Sophomore",
        "Junior",
        "Senior"
    ])
    .range([
        5,
        7,
        9,
        11
    ]);
    svg.selectAll("circle")
        .attr("r", d => sizeScale(d.year))

    //Add legend
    const legend = svg.append("g")
    .attr(
        "transform",
        `translate(${width - margin.right + 25}, 60)`
    );
    const legendItems = legend
        .selectAll(".legend-item")
        .data(majors)
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

    
    //Create tooltip --> inspect circle
    const tooltip = d3.select("#tooltip");
    svg.selectAll("circle")
    .on("mouseover", function(event, d) {
        tooltip
            .style("opacity", 1)
            .html(`
                <strong>${d.name}</strong><br>
                Study Hours: ${d.study_hours}<br>
                Score: ${d.score}<br>
                Major: ${d.major}<br>
                Year: ${d.year}
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

});

