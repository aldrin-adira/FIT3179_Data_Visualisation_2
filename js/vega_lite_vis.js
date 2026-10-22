// This file puts every chart onto the web page.
// Each chart's design lives in its own .vg.json file in this folder.
// For each chart, this file loads that design, gives it the site's colours
// and fonts, and draws it inside its box in index.html.

// Settings used for every chart:
// - actions: false hides the little "..." menu in the chart's corner.
// - renderer: "svg" draws the charts as sharp shapes and real text,
//   so the text can use the web fonts once they have loaded.
// - tooltip: true shows hover details on marks that define tooltip content.
var embedOptions = {actions: false, renderer: "svg", tooltip: true};
// Keep the finished views so they can be released before a responsive redraw.
var chartViews = {};
var chartJobs = [];
// Cache chart definitions across resize redraws; clone before applying state.
var specCache = new Map();
var svgObservers = [];

// Wrap headings using actual loaded-font measurements. This prevents long
// subtitles or multi-line titles being clipped inside half-width cards.
var measurementContext = document.createElement("canvas").getContext("2d");
vega.expressionFunction("wrapChartText", function(input, maxWidth, fontSize, fontFamily) {
    measurementContext.font = fontSize + "px " + fontFamily;
    var lines = [];
    (Array.isArray(input) ? input : [input]).forEach(function(line) {
        var current = "";
        String(line).split(/\s+/).forEach(function(word) {
            var next = current ? current + " " + word : word;
            if (current && measurementContext.measureText(next).width > maxWidth - 8) {
                lines.push(current);
                current = word;
            } else current = next;
        });
        if (current) lines.push(current);
    });
    return lines;
});

// A list that pairs each chart setting name with a colour or font name from
// css/style.css. Example: when a chart asks for "colorPetDogs", it gets the
// colour stored in "--color-pet-dogs". Because of this, colours and fonts are
// only written down once, in style.css, and every chart matches the page.
var themeSignals = {
    colorNeutral: "--color-neutral",
    colorAccent: "--color-accent",
    colorHeading: "--color-heading",
    colorMuted: "--color-muted",
    colorDark: "--color-dark",
    colorLight: "--color-light",
    colorPage: "--color-page",
    colorSurface: "--color-surface",
    colorBorder: "--color-border",
    colorMapWater: "--color-map-water",
    colorMapLand: "--color-map-land",
    colorPetDogs: "--color-pet-dogs",
    colorPetCats: "--color-pet-cats",
    colorPetFish: "--color-pet-fish",
    colorPetBirds: "--color-pet-birds",
    colorPetSmallMammals: "--color-pet-small-mammals",
    colorPetReptiles: "--color-pet-reptiles",
    colorPetOther: "--color-pet-other",
    colorPetDogsLight: "--color-pet-dogs-light",
    colorPetDogsMidLight: "--color-pet-dogs-mid-light",
    colorPetDogsMidDark: "--color-pet-dogs-mid-dark",
    colorPetDogsDark: "--color-pet-dogs-dark",
    colorPetCatsLight: "--color-pet-cats-light",
    colorPetCatsDark: "--color-pet-cats-dark",
    fontHeading: "--font-heading",
    fontBody: "--font-body"
};

// Give one chart the site's colours and fonts before it is drawn.
// It looks at every setting (signal) in the chart. If the setting's name is
// in the list above, it reads the matching value from style.css and puts it
// in place of the backup value written in the chart file.
function applyTheme(spec) {
    // Read all the colour and font values that style.css has set on the page.
    var styles = getComputedStyle(document.documentElement);
    (spec.signals || []).forEach(function (signal) {
        // The loader redraws at the final browser width. Independent window
        // listeners inside fit-sized charts can otherwise shrink a plot to zero.
        if (signal.name === "width") {
            signal.on = [];
            // Very small phones use the tested compact layout, scaled to fit.
            signal.init = "max(344, containerSize()[0])";
        }
        // Breakpoints use the available card width, not Vega's fitted plot
        // width. Axis/header padding changes the latter during autosizing;
        // switching label layouts on it can otherwise oscillate indefinitely.
        if ((signal.name === "narrow" || signal.name === "stacked") &&
                typeof signal.update === "string" && /^width\s*</.test(signal.update)) {
            signal.update = signal.update.replace(/\bwidth\b/g, "max(344, containerSize()[0])");
        }
        var property = themeSignals[signal.name];
        var value = property ? styles.getPropertyValue(property).trim() : "";
        // Only replace the backup if style.css really has a value.
        if (value) {
            signal.value = value;
        }
    });
    // Vega expressions run after layout, so wrapping uses the final plot width.
    if (spec.title) {
        var title = spec.title;
        // Serif glyphs extend beyond Vega's font-metric title box. Keep a
        // small top inset and an explicit title/subtitle gap at every width.
        var padding = spec.padding;
        if (typeof padding === "number") {
            spec.padding = {top: padding + 6, right: padding, bottom: padding, left: padding};
        } else {
            spec.padding = Object.assign({}, padding, {top: ((padding && padding.top) || 0) + 6});
        }
        if (typeof title.subtitlePadding !== "object") title.subtitlePadding = Math.max(8, title.subtitlePadding || 0);
        ["text", "subtitle"].forEach(function(key) {
            if (!title[key]) return;
            var original = title[key].signal || JSON.stringify(title[key]);
            var size = key === "text" ? title.fontSize : title.subtitleFontSize;
            var font = key === "text" ? "fontHeading" : "fontBody";
            var sizeExpression = size && size.signal ? size.signal : (size || 13);
            title[key] = {signal: "wrapChartText((" + original + "), width, (" + sizeExpression + "), " + font + ")"};
        });
        title.lineHeight = {signal: (spec.signals.some(function(s) { return s.name === "narrow"; }) ? "narrow" : "stacked") + " ? 24 : 29"};
        title.subtitleLineHeight = 17;
    }
    return spec;
}

// Draw one chart. "container" is the box on the page (for example
// "#chart1_chart") and "specUrl" is the chart's design file.
// Steps: load the file, read it as JSON, add the site's colours and fonts,
// wait for fonts, then draw it with Vega-Embed.
// It hands back the finished chart (its "view") for responsive layout.
// If anything goes wrong, the error is shown in
// the browser console and a visible message; other charts continue loading.
function embedChart(container, specUrl) {
    var host = document.querySelector(container);
    host.setAttribute("role", "group");
    host.setAttribute("aria-busy", "true");
    host.innerHTML = '<p class="chart-status" role="status">Loading chart…</p>';
    var definition = specCache.has(specUrl) ? Promise.resolve(specCache.get(specUrl)) : fetch(specUrl)
        .then(function (response) {
            if (!response.ok) throw new Error("Chart file could not be loaded: " + specUrl);
            return response.json();
        }).then(function(spec) { specCache.set(specUrl, spec); return spec; });
    var job = definition.then(function(spec) { return JSON.parse(JSON.stringify(spec)); })
        .then(function (spec) {
            host.setAttribute("aria-label", spec.description || "Data chart");
            return document.fonts.ready.then(function() {
                return vegaEmbed(container, applyTheme(spec), embedOptions);
            });
        })
        .then(function (result) {
            // Fonts are ready before embedding, so no second sizing pass is needed.
            var svg = host.querySelector("svg");
            if (svg) {
                function fitSvg() {
                    svg.setAttribute("viewBox", "0 0 " + svg.getAttribute("width") + " " + svg.getAttribute("height"));
                }
                fitSvg();
                // Paired-card layout can change chart height, so keep the scaling box current.
                var observer = new MutationObserver(fitSvg);
                observer.observe(svg, {attributes: true, attributeFilter: ["width", "height"]});
                svgObservers.push(observer);
                svg.style.maxWidth = "100%";
                svg.style.height = "auto";
            }
            host.setAttribute("aria-busy", "false");
            chartViews[container] = result.view;
            return result.view;
        })
        .catch(function(error) {
            host.setAttribute("aria-busy", "false");
            host.innerHTML = '<p class="chart-status" role="alert">Chart unavailable. Reload or consult the sources in the footer.</p>';
            console.error(error);
        });
    chartJobs.push(job);
    return job;
}

// Draw every chart at the current container width. Old views are released
// first so their event listeners do not remain after a browser resize.
var drawing = false;
var redrawRequested = false;
function drawCharts() {
    if (drawing) { redrawRequested = true; return; }
    drawing = true;
    // Disconnect observers before replacing SVGs, preventing retained DOM nodes.
    svgObservers.forEach(function(observer) { observer.disconnect(); });
    svgObservers = [];
    Object.entries(chartViews).forEach(function(entry) {
        entry[1].finalize();
    });
    chartViews = {};
    chartJobs = [];
    // Which box on the page, and which design file goes in it.
    // Section 1: world map, then the beeswarm of 43 countries.
    embedChart("#chart1_chart", "js/world_map.vg.json");
    embedChart("#chart2_chart", "js/country_beeswarm.vg.json");
    // Section 2: how pet ownership changed from 2016 to 2025, and which
    // households own pets.
    embedChart("#chart3_chart", "js/ownership_trend.vg.json");
    embedChart("#chart4_chart", "js/household_groups.vg.json");
    // Section 3: which pets Australians keep, and why they chose them.
    embedChart("#chart5_chart", "js/pet_types.vg.json");
    embedChart("#chart6_chart", "js/motivations.vg.json");
    // Section 4: what pets cost, and what stops people getting one.
    embedChart("#chart7_chart", "js/spending_tree.vg.json");
    embedChart("#chart8_chart", "js/barriers.vg.json");
    // Section 5: dog maps compare totals with resident rates.
    embedChart("#chart9_chart", "js/sa_pet_symbols.vg.json");
    embedChart("#chart10_chart", "js/sa_councils_map.vg.json");
    embedChart("#chart11_chart", "js/density_scatter.vg.json");
    // Section 6: waffle charts compare three dog/cat motivations.
    embedChart("#chart12_chart", "js/draws_and_limits.vg.json");
    window.chartsReady = Promise.all(chartJobs).then(function() {
        drawing = false;
        // Fill paired cards after the charts have finished drawing.
        window.dispatchEvent(new Event("charts-ready"));
        if (redrawRequested) { redrawRequested = false; drawCharts(); }
    });
}

// Paired cards share top and bottom edges (fewer sightlines). Instead of a
// gap inside the shorter card, a chart host marked data-fill-height grows its
// plot through the spec's "extraHeight" signal. The free space is the used
// margin-top of the card's source line, which CSS sets to "auto".
function freeSpace(figure) {
    var source = figure.querySelector(".chart-source");
    return source ? parseFloat(getComputedStyle(source).marginTop) || 0 : 0;
}
function fillPairedCards() {
    document.querySelectorAll("[data-fill-height]").forEach(function(host) {
        var view = chartViews["#" + host.id];
        var figure = host.closest("figure");
        var pair = figure.closest(".panels-even, .map-pair");
        if (!view || !pair) return;
        var partners = Array.prototype.filter.call(pair.querySelectorAll("figure"), function(other) { return other !== figure; });
        var partnerFree = Math.min.apply(null, partners.map(freeSpace));
        var extra = view.signal("extraHeight");
        // Grow into this card's gap; shrink back if the partner now has one.
        var next = Math.max(0, Math.round(extra + freeSpace(figure) - partnerFree));
        if (Math.abs(next - extra) > 1) view.signal("extraHeight", next).runAsync();
    });
}
var fillFrame;
function scheduleFill() {
    cancelAnimationFrame(fillFrame);
    fillFrame = requestAnimationFrame(fillPairedCards);
}
window.addEventListener("charts-ready", scheduleFill);
// A paired chart can change height after fonts and layout have settled.
if (window.ResizeObserver) {
    var cardObserver = new ResizeObserver(scheduleFill);
    document.querySelectorAll(".panels-even figure, .map-pair figure").forEach(function(figure) { cardObserver.observe(figure); });
}

drawCharts();
// Wait for resizing to settle before laying out the charts again.
var resizeTimer;
var lastWindowWidth = window.innerWidth;
window.addEventListener("resize", function() {
    if (window.innerWidth === lastWindowWidth) return;
    lastWindowWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 180);
});
