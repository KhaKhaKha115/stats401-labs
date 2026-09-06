async function drawChart() {
    const data = await d3.csv("../data/lab4_clean_tweets.csv", d => ({
        week: d.week,
        sentiment_score: +d.sentiment_score
    }));

    const weekData = Array.from(
        d3.rollup(
            data,
            values => d3.mean(values, d => d.sentiment_score),
            d => d.week
        ),
        ([week, average_sentiment]) => ({
            week,
            average_sentiment
        })
    ).sort((a, b) => new Date(a.week) - new Date(b.week));

    const width = 900;
    const height = 500;
    const margin = { top: 30, right: 30, bottom: 90, left: 80 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const x = d3.scaleBand()
        .domain(weekData.map(d => d.week))
        .range([0, innerWidth])
        .padding(0.2);

    const yMin = d3.min(weekData, d => d.average_sentiment);

    const y = d3.scaleLinear()
        .domain([Math.min(-0.4, yMin), 0.05])
        .nice()
        .range([innerHeight, 0]);

    chart.append("g")
        .attr("transform", `translate(0, ${innerHeight})`)
        .call(
            d3.axisBottom(x)
                .tickFormat(d =>
                    d3.timeFormat("%b %d")(new Date(d))
                )
        )
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    chart.append("g")
        .call(d3.axisLeft(y));

    chart.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", y(0))
        .attr("y2", y(0))
        .attr("stroke", "#999")
        .attr("stroke-dasharray", "5 5");

    const tooltip = d3.select("#tooltip");

    chart.selectAll("rect")
        .data(weekData)
        .join("rect")
        .attr("x", d => x(d.week))
        .attr("y", d => d.average_sentiment >= 0 ? y(d.average_sentiment) : y(0))
        .attr("width", x.bandwidth())
        .attr("height", d => Math.abs(y(d.average_sentiment) - y(0)))
        .attr("fill", d => d.average_sentiment >= 0 ? "#67a96b" : "#d95f5f")
        .on("mouseenter", function(event, d) {
            d3.select(this).attr("opacity", 0.75);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.week}</strong><br>
                    Average sentiment:
                    ${d.average_sentiment.toFixed(3)}
                `);
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", `${event.pageX + 15}px`)
                .style("top", `${event.pageY - 25}px`);
        })
        .on("mouseleave", function() {
            d3.select(this).attr("opacity", 1);
            tooltip.style("opacity", 0);
        });

    chart.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 70)
        .attr("text-anchor", "middle")
        .text("Week");

    chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -55)
        .attr("text-anchor", "middle")
        .text("Average Sentiment Score");
}

drawChart();