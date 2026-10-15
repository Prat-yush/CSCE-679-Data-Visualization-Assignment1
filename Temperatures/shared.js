/*
 * shared.js
 * Settings and helper functions used by both heatmap levels
 * (level1.html and level2.html). Requires D3 v7 to be loaded first.
 */

// ---------------------------------------------------------------------------
// Shared settings
// ---------------------------------------------------------------------------
const SHARED_CONFIG = {
  dataFile: "temperature_daily.csv",

  monthNames: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ],

  // Color scale: temperatures in this range are split into equal steps,
  // from cold (purple/blue) to hot (dark red). [0, 39] reproduces the color
  // bins of the reference images exactly.
  colorDomainCelsius: [0, 39],
  colorStepCount: 11,

  // Vertical legend drawn to the right of the matrix.
  legend: {
    gapFromMatrix: 20,  // space between the matrix and the legend
    swatchWidth: 20,
    swatchHeight: 22,
    labelOffsetX: 6,    // space between the swatches and their labels
    topLabel: "0 Celsius",
    bottomLabel: "40 Celsius"
  },

  // Tooltip position relative to the mouse pointer.
  tooltipOffset: { x: 12, y: 12 },

  // Duration of the color fade when switching between max and min.
  transitionMs: 400,

  // Text shown above the chart for each mode.
  modeLabels: {
    max: "Showing: monthly maximum temperature (click the chart to switch to minimum)",
    min: "Showing: monthly minimum temperature (click the chart to switch to maximum)"
  }
};

// ---------------------------------------------------------------------------
// Data loading and aggregation
// ---------------------------------------------------------------------------

/**
 * Reads the daily CSV and converts each row into
 * { date: Date, maxTemperature: number, minTemperature: number }.
 */
function loadDailyData() {
  return d3.csv(SHARED_CONFIG.dataFile, row => ({
    date: d3.timeParse("%Y-%m-%d")(row.date),
    maxTemperature: +row.max_temperature,
    minTemperature: +row.min_temperature
  }));
}

/**
 * Groups daily records into one summary per (year, month):
 *   year, month (0-11),
 *   maxTemperature  - hottest daily maximum in the month,
 *   minTemperature  - coldest daily minimum in the month,
 *   days            - the month's daily records sorted by day (used by the mini line charts).
 */
function summarizeByMonth(dailyRecords) {
  const groupedByYearAndMonth = d3.flatGroup(
    dailyRecords,
    record => record.date.getFullYear(),
    record => record.date.getMonth()
  );

  return groupedByYearAndMonth.map(([year, month, recordsInMonth]) => ({
    year,
    month,
    maxTemperature: d3.max(recordsInMonth, record => record.maxTemperature),
    minTemperature: d3.min(recordsInMonth, record => record.minTemperature),
    days: recordsInMonth
      .map(record => ({
        dayOfMonth: record.date.getDate(),
        maxTemperature: record.maxTemperature,
        minTemperature: record.minTemperature
      }))
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
  }));
}

/** Returns the monthly value shown for the current mode ("max" or "min"). */
function getTemperatureForMode(monthSummary, mode) {
  return mode === "max" ? monthSummary.maxTemperature : monthSummary.minTemperature;
}

// ---------------------------------------------------------------------------
// Scales and axes
// ---------------------------------------------------------------------------

/**
 * Stepped color scale: splits the temperature range into equal bins,
 * cold = purple/blue, hot = dark red (reversed Spectral palette).
 */
function createColorScale() {
  const colorsColdToHot = d3.schemeSpectral[SHARED_CONFIG.colorStepCount].slice().reverse();
  return d3.scaleQuantize()
    .domain(SHARED_CONFIG.colorDomainCelsius)
    .range(colorsColdToHot);
}

/**
 * Band scales placing years along x and months along y.
 * cellPadding is the fraction of each band left empty as the white gap between cells.
 */
function createMatrixScales(years, matrixWidth, matrixHeight, cellPadding) {
  const xScale = d3.scaleBand()
    .domain(years)
    .range([0, matrixWidth])
    .padding(cellPadding);

  const yScale = d3.scaleBand()
    .domain(d3.range(12))  // months 0 (January) to 11 (December)
    .range([0, matrixHeight])
    .padding(cellPadding);

  return { xScale, yScale };
}

/** Draws year labels along the top and month names down the left side. */
function drawMatrixAxes(chartGroup, xScale, yScale) {
  chartGroup.append("g")
    .attr("class", "axis axis-years")
    .call(d3.axisTop(xScale));

  chartGroup.append("g")
    .attr("class", "axis axis-months")
    .call(d3.axisLeft(yScale).tickFormat(monthIndex => SHARED_CONFIG.monthNames[monthIndex]));
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

/**
 * Draws a vertical stepped legend: one swatch per color,
 * coldest at the top and hottest at the bottom, labeled at both ends.
 */
function drawColorLegend(svg, colorScale, positionX, positionY) {
  const { swatchWidth, swatchHeight, labelOffsetX, topLabel, bottomLabel } = SHARED_CONFIG.legend;
  const colors = colorScale.range();

  const legendGroup = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${positionX},${positionY})`);

  legendGroup.selectAll("rect")
    .data(colors)
    .join("rect")
    .attr("x", 0)
    .attr("y", (color, index) => index * swatchHeight)
    .attr("width", swatchWidth)
    .attr("height", swatchHeight)
    .attr("fill", color => color);

  legendGroup.append("text")
    .attr("x", swatchWidth + labelOffsetX)
    .attr("y", 0)
    .attr("dominant-baseline", "hanging")
    .text(topLabel);

  legendGroup.append("text")
    .attr("x", swatchWidth + labelOffsetX)
    .attr("y", colors.length * swatchHeight)
    .attr("dominant-baseline", "hanging")
    .text(bottomLabel);

  return legendGroup;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/** Formats a month summary as "Date: 2002-03; max: 28 min: 14". */
function formatTooltipText(monthSummary) {
  const monthNumber = String(monthSummary.month + 1).padStart(2, "0");
  return `Date: ${monthSummary.year}-${monthNumber}; ` +
         `max: ${monthSummary.maxTemperature} min: ${monthSummary.minTemperature}`;
}

/**
 * Creates the tooltip <div> and returns show/hide functions
 * to attach to the matrix cells' mouse events.
 */
function createTooltip() {
  const tooltip = d3.select("body").append("div").attr("class", "tooltip");
  const { x: offsetX, y: offsetY } = SHARED_CONFIG.tooltipOffset;

  function showTooltip(event, monthSummary) {
    tooltip
      .style("opacity", 1)
      .style("left", `${event.pageX + offsetX}px`)
      .style("top", `${event.pageY + offsetY}px`)
      .text(formatTooltipText(monthSummary));
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  return { showTooltip, hideTooltip };
}

// ---------------------------------------------------------------------------
// Max / min toggle
// ---------------------------------------------------------------------------

/**
 * Switches between "max" and "min" each time the chart is clicked.
 * Calls onModeChange(newMode) right away with the starting mode, then after every click,
 * and keeps the mode label above the chart up to date.
 */
function enableModeToggle(clickTarget, modeLabelElement, onModeChange, startingMode = "max") {
  let currentMode = startingMode;

  function applyMode() {
    modeLabelElement.text(SHARED_CONFIG.modeLabels[currentMode]);
    onModeChange(currentMode);
  }

  clickTarget.style("cursor", "pointer").on("click", () => {
    currentMode = currentMode === "max" ? "min" : "max";
    applyMode();
  });

  applyMode();
}
