const width = 800;
const height = 450;
const chartHeight = 350;

/* Meaning of codeblock below:
<div id="chart">
     <svg width="700" height="400"></svg>
 </div> */
const svg = d3.select('#chart')
    .append("svg")
    .attr("width", width)
    .attr("height", height);

d3.csv("../data/students.csv", d => ({
    name: d.name,
    score: +d.score
})).then(data => {
    console.log(data);

    //Bars
    svg.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", (d,i) => i*90+20)
        .attr("y", d => chartHeight - d.score*3 )
        .attr("width", 60)
        .attr("height", d => d.score*3)
        .attr("fill", "Violet");

    //Student Names
    svg.selectAll(".name")
        .data(data)
        .join("text")
        .attr("class", "name")
        .attr("x", (d,i) => i*90+50)
        .attr("y", chartHeight + 25)
        .attr("text-anchor", "middle")
        .text(d=> d.name);

    //Scores
    svg.selectAll(".score")
        .data(data)
        .join("text")
        .attr("class", "score")
        .attr("x", (d,i) => i*90+50)
        .attr("y", chartHeight + 45)
        .attr("text-anchor", "middle")
        .text(d => d.score)
});

