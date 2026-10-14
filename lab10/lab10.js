const width = 1100;
const height = 620;
const tooltip = d3.select("#lab10-tooltip");
const noDataColor = "#e5e5e5";
const legendHeight = 130;
const totalHeight = height + legendHeight;

let selectedIso = null;
let hoveredIso = null;
let countryByIso = new Map();
let countryByName = new Map();
let recognition = null;
let wantsContinuousListening = false;
let recognitionActive = false;
let recognitionStarting = false;
let restartTimer = null;
let restartHistory = [];
let recognitionStartedAt = 0;
let recognitionGeneration = 0;
let processedResultKeys = new Set();
let lastFinalTranscript = "";
let lastFinalTranscriptAt = 0;

const startButton = document.querySelector("#voice-start");
const stopButton = document.querySelector("#voice-stop");
const resetButton = document.querySelector("#selection-reset");
const countrySelect = document.querySelector("#country-select");
const statusOutput = document.querySelector("#voice-status");
const transcriptOutput = document.querySelector("#voice-transcript");
const actionOutput = document.querySelector("#voice-action");
const selectedCountryPanel = document.querySelector("#selected-country-panel");
const selectedCountryName = document.querySelector("#selected-country-name");
const selectedCountryGdp = document.querySelector("#selected-country-gdp");
const selectedCountryRank = document.querySelector("#selected-country-rank");

setupVoiceRecognition();
setupControlEvents();

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
    countryByIso = gdpByIso;
    buildCountryLookup(gdpData);
    populateCountrySelect(gdpData);
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
}).catch(error => {
    console.error("Lab 10 data loading error:", error);
    statusOutput.textContent = "Data could not be loaded.";
    setActionFeedback("The maps and country controls are unavailable.", true);
});

function normalizeSpeech(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildCountryLookup(gdpData) {
    countryByName = new Map(
        gdpData.map(record => [normalizeSpeech(record.country), record])
    );

    const aliases = new Map([
        ["usa", "united states"],
        ["us", "united states"],
        ["america", "united states"],
        ["uk", "united kingdom"],
        ["britain", "united kingdom"],
        ["great britain", "united kingdom"],
        ["south korea", "korea republic of"],
        ["korea", "korea republic of"],
        ["russia", "russian federation"],
        ["turkey", "turkiye"],
        ["uae", "united arab emirates"]
    ]);

    aliases.forEach((canonicalName, alias) => {
        const record = countryByName.get(canonicalName);
        if (record) {
            countryByName.set(alias, record);
        }
    });
}

function populateCountrySelect(gdpData) {
    countrySelect.innerHTML = '<option value="">Choose a country</option>';
    [...gdpData]
        .sort((a, b) => a.country.localeCompare(b.country))
        .forEach(record => {
            const option = document.createElement("option");
            option.value = record.iso3;
            option.textContent = record.country;
            countrySelect.appendChild(option);
        });
    countrySelect.disabled = false;
}

function setupControlEvents() {
    resetButton.addEventListener("click", () => resetSelection("Selection cleared."));

    countrySelect.addEventListener("change", event => {
        const iso3 = event.target.value;
        if (!iso3) {
            resetSelection("Selection cleared.");
            return;
        }
        selectCountry(iso3);
    });
}

function setupVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        startButton.disabled = true;
        stopButton.disabled = true;
        statusOutput.textContent = "Voice recognition is not supported in this browser. You can still select countries using the dropdown or mouse.";
        setActionFeedback("Use the dropdown or mouse to explore the maps.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    startButton.addEventListener("click", startListening);
    stopButton.addEventListener("click", stopListening);

    recognition.onstart = () => {
        recognitionStarting = false;
        recognitionActive = true;
        recognitionStartedAt = Date.now();
        statusOutput.textContent = "Listening…";
        updateRecognitionControls();
    };

    recognition.onresult = event => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result.isFinal) {
                continue;
            }

            const transcript = result[0].transcript.trim();
            const resultKey = `${recognitionGeneration}:${index}`;
            if (processedResultKeys.has(resultKey) || isRecentlyProcessedTranscript(transcript)) {
                continue;
            }

            processedResultKeys.add(resultKey);
            lastFinalTranscript = normalizeSpeech(transcript);
            lastFinalTranscriptAt = Date.now();
            transcriptOutput.textContent = `“${transcript}”`;
            statusOutput.textContent = "Listening…";
            handleVoiceCommand(transcript);
        }
    };

    recognition.onerror = event => {
        const messages = {
            "not-allowed": "Microphone permission denied",
            "service-not-allowed": "Microphone permission denied",
            "no-speech": "No speech was detected. Listening will continue.",
            "audio-capture": "No working microphone was found.",
            "network": "A network error interrupted speech recognition. Retrying…",
            "bad-grammar": "Speech recognition could not use the requested grammar.",
            "language-not-supported": "The selected speech recognition language is not supported."
        };
        const message = messages[event.error] || `Speech recognition error: ${event.error}.`;

        if (event.error === "aborted" && !wantsContinuousListening) {
            return;
        }

        const fatalErrors = new Set([
            "not-allowed",
            "service-not-allowed",
            "audio-capture",
            "bad-grammar",
            "language-not-supported"
        ]);
        if (fatalErrors.has(event.error)) {
            wantsContinuousListening = false;
            clearPendingRestart();
        }

        statusOutput.textContent = message;
        setActionFeedback("No map selection was changed.", true);
        updateRecognitionControls();
    };

    recognition.onend = () => {
        recognitionActive = false;
        recognitionStarting = false;

        if (!wantsContinuousListening) {
            updateRecognitionControls();
            return;
        }

        if (Date.now() - recognitionStartedAt > 5000) {
            restartHistory = [];
        }
        scheduleRecognitionRestart();
    };
}

function startListening() {
    if (!recognition || wantsContinuousListening) {
        return;
    }

    wantsContinuousListening = true;
    restartHistory = [];
    lastFinalTranscript = "";
    lastFinalTranscriptAt = 0;
    clearPendingRestart();
    statusOutput.textContent = "Listening…";
    setActionFeedback("Waiting for a voice command.");
    updateRecognitionControls();
    startRecognitionSession(false);
}

function stopListening() {
    if (!recognition || !wantsContinuousListening) {
        return;
    }

    wantsContinuousListening = false;
    clearPendingRestart();
    statusOutput.textContent = "Stopped";
    setActionFeedback("Voice recognition stopped. The current selection remains active.");
    updateRecognitionControls();

    if (recognitionActive || recognitionStarting) {
        try {
            recognition.stop();
        } catch (error) {
            try {
                recognition.abort();
            } catch (abortError) {
                console.warn("Lab 10 speech recognition could not be stopped cleanly.", abortError);
            }
        }
    }
}

function startRecognitionSession(isRestart) {
    if (!recognition || !wantsContinuousListening || recognitionActive || recognitionStarting) {
        return;
    }

    recognitionStarting = true;
    recognitionStartedAt = Date.now();
    recognitionGeneration += 1;
    processedResultKeys = new Set();
    updateRecognitionControls();

    try {
        recognition.start();
    } catch (error) {
        recognitionStarting = false;
        if (isRestart && wantsContinuousListening) {
            scheduleRecognitionRestart();
            return;
        }

        wantsContinuousListening = false;
        statusOutput.textContent = "Error";
        setActionFeedback(error.message || "Could not start voice recognition.", true);
        updateRecognitionControls();
    }
}

function scheduleRecognitionRestart() {
    if (!wantsContinuousListening || restartTimer !== null) {
        return;
    }

    const now = Date.now();
    restartHistory = restartHistory.filter(timestamp => now - timestamp < 8000);
    if (restartHistory.length >= 5) {
        wantsContinuousListening = false;
        statusOutput.textContent = "Error";
        setActionFeedback("Speech recognition stopped after repeated restart failures. Click Start Listening to try again.", true);
        updateRecognitionControls();
        return;
    }

    restartHistory.push(now);
    statusOutput.textContent = "Listening…";
    restartTimer = window.setTimeout(() => {
        restartTimer = null;
        startRecognitionSession(true);
    }, 400);
}

function clearPendingRestart() {
    if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
        restartTimer = null;
    }
}

function updateRecognitionControls() {
    const listeningRequested = wantsContinuousListening || recognitionActive || recognitionStarting;
    startButton.disabled = listeningRequested;
    stopButton.disabled = !wantsContinuousListening;
    startButton.innerHTML = listeningRequested
        ? '<span aria-hidden="true">🎙</span> Listening…'
        : '<span aria-hidden="true">🎙</span> Start Listening';
}

function isRecentlyProcessedTranscript(transcript) {
    const normalizedTranscript = normalizeSpeech(transcript);
    return normalizedTranscript === lastFinalTranscript
        && Date.now() - lastFinalTranscriptAt < 1000;
}

function handleVoiceCommand(transcript) {
    const command = normalizeSpeech(transcript);

    if (command === "reset" || command === "clear selection") {
        resetSelection("Selection cleared by voice command.");
        return;
    }

    const commandMatch = command.match(/^(highlight|show|find|select)\s+(.+)$/);
    if (!commandMatch) {
        setActionFeedback('Command not recognized. Try “Highlight Japan” or “Reset.”', true);
        return;
    }

    const requestedCountry = commandMatch[2];
    const record = countryByName.get(requestedCountry);
    if (!record) {
        setActionFeedback("Country not found in the GDP dataset.", true);
        return;
    }

    selectCountry(record.iso3);
}

function selectCountry(iso3) {
    const record = countryByIso.get(iso3);
    if (!record) {
        setActionFeedback("Country not found in the GDP dataset.", true);
        return;
    }

    selectedIso = iso3;
    countrySelect.value = iso3;
    updateVisualHighlight();
    updateSelectedCountryInfo(record);
    setActionFeedback(`Highlighting ${record.country} on both maps.`);
}

function resetSelection(message) {
    selectedIso = null;
    hoveredIso = null;
    countrySelect.value = "";
    updateVisualHighlight();
    updateSelectedCountryInfo(null);
    hideTooltip();
    setActionFeedback(message);
}

function updateSelectedCountryInfo(record) {
    if (!record) {
        selectedCountryPanel.hidden = true;
        selectedCountryName.textContent = "";
        selectedCountryGdp.textContent = "";
        selectedCountryRank.textContent = "";
        return;
    }

    selectedCountryName.textContent = record.country;
    selectedCountryGdp.textContent = `GDP: $${d3.format(",.0f")(record.gdp)} billion`;
    selectedCountryRank.textContent = `Rank: #${record.rank}`;
    selectedCountryPanel.hidden = false;
}

function setActionFeedback(message, isError = false) {
    actionOutput.textContent = message;
    actionOutput.classList.toggle("feedback-error", isError);
}

function getIso3(feature) {
    const p = feature.properties;
    return p.iso3 || p.ISO_A3 || p.ADM0_A3 || p.iso_a3 || p.adm0_a3 || p.ISO3 || null;
}
function getCountryName(feature) {
    const p = feature.properties;
    return p.name || p.NAME || p.ADMIN || p.name_long || "Unknown";
}
function drawChoropleth(geoData, gdpData) {
    const container = d3.select("#lab10-choropleth");
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
            hoveredIso = d.properties.iso3;
            updateVisualHighlight();
            const record = d.properties.gdpData;
            const country = record?.country || getCountryName(d);
            showTooltip(event, country, record);
        })
        .on("mousemove", event => moveTooltip(event))
        .on("mouseout", () => {
            hoveredIso = null;
            updateVisualHighlight();
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
    const container = d3.select("#lab10-cartogram");
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
                    hoveredIso = null;
                    updateVisualHighlight();
                    hideTooltip();
                    return;
                }
                const d = d3.select(target).datum();
                if (!d?.properties) {
                    hoveredIso = null;
                    updateVisualHighlight();
                    hideTooltip();
                    return;
                }
                const iso = d.properties.iso3;
                const record = d.properties.gdpData;
                const country = d.properties.countryName || getCountryName(d);
                if (iso) {
                    hoveredIso = iso;
                    updateVisualHighlight();
                }
                showTooltip(event, country, record);
            })
            .on("pointerleave.linked", function() {
                hoveredIso = null;
                updateVisualHighlight();
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
        updateVisualHighlight();
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
    d3.selectAll("#lab10-choropleth .country")
        .attr("opacity", d => d.properties.iso3 === iso3 ? 1 : 0.3)
        .attr("stroke", d => d.properties.iso3 === iso3 ? "#111" : "#fff")
        .attr("stroke-width", d => d.properties.iso3 === iso3 ? 2 : 0.6);
    d3.selectAll("#lab10-cartogram path.feature")
        .attr("opacity", d => d?.properties?.iso3 === iso3 ? 1 : 0.25)
        .attr("stroke", d => d?.properties?.iso3 === iso3 ? "#111" : "#aaa")
        .attr("stroke-width", d => d?.properties?.iso3 === iso3 ? 2.2 : 0.7);
}
function clearHighlight() {
    d3.selectAll("#lab10-choropleth .country")
        .attr("opacity", 1)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.6);
    d3.selectAll("#lab10-cartogram path.feature")
        .attr("opacity", 1)
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.7);
}

function updateVisualHighlight() {
    const activeIso = hoveredIso || selectedIso;
    if (activeIso) {
        highlightCountry(activeIso);
    } else {
        clearHighlight();
    }
}
