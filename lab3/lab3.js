d3.csv("../data/lab3_data.csv", d => ({
    id: +d.id,
    name: d.name,
    height: +d.height,
    weight: +d.weight,
    base_experience: +d.base_experience,
    type: d.type
}))
.then(data => {

    const columns = [
        "id",
        "name",
        "height",
        "weight",
        "base_experience",
        "type"
    ];

    let ascending = true;

    const table = d3.select("#data-table");


    // Create table header
    const header = table
        .select("thead")
        .append("tr");

    header
        .selectAll("th")
        .data(columns)
        .join("th")
        .text(d => d)
        .style("cursor", "pointer")
        .on("click", function(event, column) {

            data.sort((a, b) =>
                ascending
                    ? d3.ascending(a[column], b[column])
                    : d3.descending(a[column], b[column])
            );

            ascending = !ascending;

            updateRows();
        });


    // Create / update rows
    function updateRows() {

        const rows = table
            .select("tbody")
            .selectAll("tr")
            .data(data)
            .join("tr");

        rows
            .selectAll("td")
            .data(row =>
                columns.map(column => row[column])
            )
            .join("td")
            .text(d => d);
    }


    updateRows();

})
.catch(error => {
    console.error("Error loading Pokemon data:", error);
});