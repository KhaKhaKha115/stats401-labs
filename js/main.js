console.log("Hello STATS 401!");
console.log("D3 version:", d3.version);

d3.select("#message").text("This text was changed by D3");
d3.csv("data/students.csv")
    .then(data => {

        console.log(data);

    });

d3.csv("data/students.csv")
    .then(data => {

        console.log(data[0]);
        console.log(typeof data[0].score);

    });

d3.csv("data/students.csv")
    .then(data => {

        data.forEach(d => {
            d.score = +d.score;
        });

        console.log(data);

    });

d3.csv("data/students.csv", d => {

    return {
        name: d.name,
        score: +d.score
    };

}).then(data => {

    console.log(data);

});

d3.json("data/students.json")
    .then(data => {

        console.log(data);

    });