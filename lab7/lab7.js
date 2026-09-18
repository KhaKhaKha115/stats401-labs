const width = 980, height = 760;
const dateFormat = d3.timeFormat("%b %d, %Y"), money = d3.format("$,.0f");
const REGION_FILL_OPACITY = .04;
const REGION_STROKE_OPACITY = .16;
const NODE_RADIUS_RANGE = [14, 38];
const BASE_LINK_WIDTH = 3.5;
const sectorColors = d3.scaleOrdinal().range(["#e76f51", "#2a9d8f", "#e9c46a", "#457b9d", "#9b5de5", "#f4a261"]);
const regionColors = d3.scaleOrdinal().domain(["Asia", "Europe", "North America"]).range(["#ffbe0b", "#fb5607", "#3a86ff"]);
// Link pattern is the primary transaction-type encoding; edit only this map to remap styles.
const transactionTypeStyles = {
    goods:      {label:"Goods",      dasharray:null,       linecap:"round"},
    shipping:   {label:"Shipping",   dasharray:"12 6",     linecap:"butt"},
    components: {label:"Components", dasharray:"8 4",      linecap:"butt"},
    materials:  {label:"Materials",  dasharray:"1 7",      linecap:"round"},
    services:   {label:"Services",   dasharray:"12 5 2 5", linecap:"round"}
};
const regionLayout = {
    Europe: {x:width * .5, y:180, radius:140},
    Asia: {x:width * .25, y:604, radius:140},
    "North America": {x:width * .75, y:604, radius:140}
};
const svg = d3.select("#network").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Node-link diagram of daily commercial transactions");
svg.append("defs").append("filter").attr("id", "soft-shadow").html('<feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.22"/>');
const regionGroup = svg.append("g").attr("class","region-areas");
const linkGroup = svg.append("g"), nodeGroup = svg.append("g"), labelGroup = svg.append("g"), tooltip = d3.select("#tooltip");
let companies = [], transactions = [], currentDay = 1, timer = null, currentLinks = [];
let linkSelection = linkGroup.selectAll("line"), nodeSelection, labelSelection;
let nodeRadiusScale, linkColorScale, transactionAmountSummary, currentVolumeSummary;
const simulation = d3.forceSimulation().force("charge", d3.forceManyBody().strength(-310)).force("collide", d3.forceCollide().radius(d => (d.radius || 14) + 12).iterations(2)).force("center", d3.forceCenter(width / 2, height / 2)).force("x", d3.forceX(width / 2).strength(.035)).force("y", d3.forceY(height / 2).strength(.055)).on("tick", ticked);

Promise.all([
    d3.csv("../data/lab7_assignment_companies.csv"),
    d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({date:d3.timeParse("%Y-%m-%d")(d.date), day:+d.day, source:d.source, target:d.target, amount_usd:+d.amount_usd, transaction_type:d.transaction_type, transaction_count:+d.transaction_count}))
]).then(([companyData, transactionData]) => {
    companies = companyData; transactions = transactionData;
    sectorColors.domain([...new Set(companies.map(d => d.sector))]);
    const dailyVolumes = d3.rollups(transactions.flatMap(d => [{day:d.day,id:d.source,amount:d.amount_usd},{day:d.day,id:d.target,amount:d.amount_usd}]), v => d3.sum(v,d => d.amount), d => `${d.day}-${d.id}`);
    const dailyVolumeMap = new Map(dailyVolumes);
    const allCurrentVolumes = d3.range(1,61).flatMap(day => companies.map(company => dailyVolumeMap.get(`${day}-${company.id}`) || 0));
    transactionAmountSummary = summarizeValues(transactions.map(d => d.amount_usd));
    currentVolumeSummary = summarizeValues(allCurrentVolumes);
    // Radius is area-aware: 14px at zero volume, approximately the mid-20s near the median, and 38px at the observed maximum.
    nodeRadiusScale = d3.scaleSqrt().domain([currentVolumeSummary.min,currentVolumeSummary.max]).range(NODE_RADIUS_RANGE).clamp(true);
    // A single hue family keeps type dependent on pattern; saturation/intensity carries amount.
    linkColorScale = d3.scaleSequential(d3.interpolateHsl("#aaa6b8", "#5035d1")).domain([transactionAmountSummary.min,transactionAmountSummary.max]).clamp(true);
    regionGroup.selectAll("circle").data(regionColors.domain()).join("circle").attr("class","region-area").attr("cx",d=>regionLayout[d].x).attr("cy",d=>regionLayout[d].y).attr("r",d=>regionLayout[d].radius).attr("fill",d=>regionColors(d)).attr("fill-opacity",REGION_FILL_OPACITY).attr("stroke",d=>regionColors(d)).attr("stroke-opacity",REGION_STROKE_OPACITY);
    regionGroup.selectAll("text").data(regionColors.domain()).join("text").attr("class","region-label").attr("x",d=>regionLayout[d].x).attr("y",d=>regionLayout[d].y-regionLayout[d].radius-8).text(d=>d);
    simulation.force("x", d3.forceX(d => regionLayout[d.region].x).strength(.16));
    simulation.force("y", d3.forceY(d => regionLayout[d.region].y).strength(.16));
    nodeSelection = nodeGroup.selectAll("circle").data(companies,d => d.id).join("circle").attr("class","company-node").attr("r",NODE_RADIUS_RANGE[0]).attr("fill",d => sectorColors(d.sector)).attr("stroke","none").attr("stroke-width",0).call(d3.drag().on("start",dragStarted).on("drag",dragged).on("end",dragEnded)).on("pointerenter",showNodeTooltip).on("pointermove",moveTooltip).on("pointerleave",hideTooltip);
    labelSelection = labelGroup.selectAll("text").data(companies,d => d.id).join("text").attr("class","node-label").text(d => d.company_name.split(" ")[0]);
    simulation.nodes(companies); buildLegends(); bindControls(); showDay(1); setPlaybackState(false);
}).catch(error => { console.error(error); d3.select("#network").classed("chart-error",true).text("Could not load the CSV data."); });

function showDay(day) {
    currentDay = Math.max(1, Math.min(60, day)); currentLinks = transactions.filter(d => d.day === currentDay);
    const volume = new Map(companies.map(d => [d.id,0])), active = new Set();
    currentLinks.forEach(d => { const s=idOf(d.source), t=idOf(d.target); active.add(s).add(t); volume.set(s,volume.get(s)+d.amount_usd); volume.set(t,volume.get(t)+d.amount_usd); });
    companies.forEach(d => { d.currentVolume=volume.get(d.id); d.active=active.has(d.id); d.radius=nodeRadiusScale(d.currentVolume); });
    linkSelection = linkGroup.selectAll("line").data(currentLinks,linkKey).join(
        enter => enter.append("line").attr("class","transaction-link").attr("stroke",d => linkColorScale(d.amount_usd)).attr("stroke-width",BASE_LINK_WIDTH).attr("stroke-dasharray",d => transactionTypeStyles[d.transaction_type].dasharray).attr("stroke-linecap",d => transactionTypeStyles[d.transaction_type].linecap).attr("opacity",0).on("pointerenter",showLinkTooltip).on("pointermove",moveTooltip).on("pointerleave",hideTooltip).call(s => s.transition().duration(400).attr("opacity",.84)),
        update => update.attr("stroke",d => linkColorScale(d.amount_usd)).attr("stroke-width",BASE_LINK_WIDTH).attr("stroke-dasharray",d => transactionTypeStyles[d.transaction_type].dasharray).attr("stroke-linecap",d => transactionTypeStyles[d.transaction_type].linecap).call(s => s.transition().duration(250).attr("opacity",.84)),
        exit => exit.transition().duration(400).attr("opacity",0).remove()
    );
    nodeSelection.classed("inactive",d => !d.active).transition().duration(400).attr("r",d => d.radius).attr("stroke","none").attr("stroke-width",0);
    simulation.force("link", d3.forceLink(currentLinks).id(d => d.id).distance(150).strength(.16)).force("collide").radius(d => d.radius+8);
    simulation.alpha(.28).restart();
    const date=currentLinks[0]?.date||d3.timeDay.offset(new Date(2026,0,1),currentDay-1);
    d3.select("#day-label").text(`Day ${currentDay}`); d3.select("#date-label").text(dateFormat(date)); d3.select("#time-slider").property("value",currentDay);
    d3.select("#active-count").text(active.size); d3.select("#link-count").text(currentLinks.length); d3.select("#value-total").text(money(d3.sum(currentLinks,d => d.amount_usd))); d3.select("#transaction-count").text(d3.sum(currentLinks,d => d.transaction_count));
}
function ticked(){ companies.forEach(constrainToRegion); linkSelection.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y); if(nodeSelection)nodeSelection.attr("cx",d=>d.x).attr("cy",d=>d.y);if(labelSelection)labelSelection.attr("x",d=>d.x).attr("y",d=>d.y+d.radius+16); }
function bindControls(){d3.select("#play").on("click",play);d3.select("#pause").on("click",pause);d3.select("#reset").on("click",reset);d3.select("#time-slider").on("input",function(){pause();showDay(+this.value);});}
function play(){if(timer)return;if(currentDay>=60)showDay(1);setPlaybackState(true);timer=d3.interval(()=>{if(currentDay>=60){pause();return;}showDay(currentDay+1);},900);}
function pause(){if(timer)timer.stop();timer=null;setPlaybackState(false);}
function reset(){pause();companies.forEach(d=>{d.fx=null;d.fy=null;});showDay(1);}
function setPlaybackState(isPlaying){d3.select("#play").classed("active",isPlaying).attr("aria-pressed",isPlaying);d3.select("#pause").classed("active",!isPlaying).attr("aria-pressed",!isPlaying);}
function buildLegends(){
    addLegend("#sector-legend",sectorColors.domain(),sectorColors,"fill");
    addLegend("#region-legend",regionColors.domain(),regionColors,"area");
    buildVolumeLegend();
    const amountLegend=d3.select("#amount-legend");
    amountLegend.append("div").attr("class","amount-gradient").style("background",`linear-gradient(to right, ${linkColorScale(transactionAmountSummary.min)}, ${linkColorScale(transactionAmountSummary.max)})`);
    const amountSamples=[{label:"Low · min",value:transactionAmountSummary.min},{label:"Medium · median",value:transactionAmountSummary.median},{label:"High · max",value:transactionAmountSummary.max}];
    const amountItems=amountLegend.append("div").attr("class","legend-scale-labels").selectAll("span").data(amountSamples).join("span");
    amountItems.append("b").text(d=>d.label);
    amountItems.append("small").text(d=>money(d.value));
    const styles=d3.select("#type-legend").selectAll("span").data(Object.values(transactionTypeStyles)).join("span");
    const samples=styles.append("svg").attr("viewBox","0 0 58 12").attr("aria-hidden","true");
    samples.append("line").attr("x1",2).attr("x2",56).attr("y1",6).attr("y2",6).attr("stroke",linkColorScale(transactionAmountSummary.median)).attr("stroke-width",BASE_LINK_WIDTH).attr("stroke-dasharray",d=>d.dasharray).attr("stroke-linecap",d=>d.linecap);
    styles.append("b").text(d=>d.label);
}
function buildVolumeLegend(){
    const samples=[{label:"Small · min",value:currentVolumeSummary.min},{label:"Medium · median",value:currentVolumeSummary.median},{label:"Large · max",value:currentVolumeSummary.max}];
    const items=d3.select("#volume-legend").selectAll("div").data(samples).join("div");
    const icons=items.append("svg").attr("width",d=>nodeRadiusScale(d.value)*2+4).attr("height",82).attr("aria-hidden","true");
    icons.append("circle").attr("cx",d=>nodeRadiusScale(d.value)+2).attr("cy",d=>80-nodeRadiusScale(d.value)).attr("r",d=>nodeRadiusScale(d.value));
    items.append("b").text(d=>d.label);
    items.append("small").text(d=>money(d.value));
}
function summarizeValues(values){const sorted=values.slice().sort(d3.ascending);return{min:d3.min(sorted),median:d3.median(sorted),max:d3.max(sorted)};}
function addLegend(selector,values,scale,kind){const item=d3.select(selector).selectAll("span").data(values).join("span");item.append("i").attr("class",kind).style(kind==="outline"?"border-color":"background",d=>scale(d));item.append("b").text(d=>capitalize(d));}
function showNodeTooltip(event,d){tooltip.html(`<strong>${d.company_name}</strong><br>${d.sector} · ${d.region}<br>Current volume: ${money(d.currentVolume)}<br>${d.active?"Active today":"No transactions today"}`).classed("visible",true);moveTooltip(event);}
function showLinkTooltip(event,d){const s=typeof d.source==="object"?d.source.company_name:companyName(d.source),t=typeof d.target==="object"?d.target.company_name:companyName(d.target);tooltip.html(`<strong>${s} ↔ ${t}</strong><br>${capitalize(d.transaction_type)}<br>Value: ${money(d.amount_usd)}<br>Transactions: ${d.transaction_count}`).classed("visible",true);moveTooltip(event);}
function moveTooltip(event){tooltip.style("left",`${Math.min(event.clientX+16,window.innerWidth-240)}px`).style("top",`${Math.min(event.clientY+16,window.innerHeight-125)}px`);}
function hideTooltip(){tooltip.classed("visible",false);} function idOf(v){return typeof v==="object"?v.id:v;} function linkKey(d){return[idOf(d.source),idOf(d.target)].sort().join("--");} function companyName(id){return companies.find(d=>d.id===id)?.company_name||id;} function capitalize(v){return v[0].toUpperCase()+v.slice(1);}
function constrainToRegion(d){const area=regionLayout[d.region],padding=(d.radius||14)+8,limit=area.radius-padding,dx=d.x-area.x,dy=d.y-area.y,distance=Math.hypot(dx,dy);if(distance>limit){d.x=area.x+dx/distance*limit;d.y=area.y+dy/distance*limit;}return d;}
function constrainedPoint(d,x,y){const area=regionLayout[d.region],limit=area.radius-(d.radius||14)-8,dx=x-area.x,dy=y-area.y,distance=Math.hypot(dx,dy);return distance<=limit?{x,y}:{x:area.x+dx/distance*limit,y:area.y+dy/distance*limit};}
function dragStarted(event,d){if(!event.active)simulation.alphaTarget(.18).restart();d.fx=d.x;d.fy=d.y;} function dragged(event,d){const point=constrainedPoint(d,event.x,event.y);d.fx=point.x;d.fy=point.y;} function dragEnded(event,d){if(!event.active)simulation.alphaTarget(0);const point=constrainedPoint(d,event.x,event.y);d.fx=point.x;d.fy=point.y;}
