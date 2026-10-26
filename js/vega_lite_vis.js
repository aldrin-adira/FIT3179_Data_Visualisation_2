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
var controlNames = {};
var controlValues = {};
// Preserve selections and camera state across responsive redraws.
var persistentSignals = ["pinnedKey", "housingType", "selectedCountry", "selectedPet", "selectedCouncil", "species", "region", "zoom", "pan", "cameraLon", "cameraLat", "cameraSpan"];
// Cache chart definitions across resize redraws; clone before applying state.
var specCache = new Map();
var svgObservers = [];

// Wrap headings using actual loaded-font measurements. This prevents long
// subtitles or multi-line titles being clipped inside half-width cards.
var measurementContext = document.createElement("canvas").getContext("2d");
vega.expressionFunction("wrapChartText", function(input, maxWidth, fontSize, fontFamily) {
    measurementContext.font = fontSize + "px " + fontFamily;
    var lines = [];
    var fits = function(text) { return measurementContext.measureText(text).width <= maxWidth - 8; };
    (Array.isArray(input) ? input : [input]).forEach(function(line) {
        var wrapped = [];
        var current = "";
        String(line).split(/\s+/).forEach(function(word) {
            var next = current ? current + " " + word : word;
            if (current && !fits(next)) {
                wrapped.push(current);
                current = word;
            } else current = next;
        });
        if (current) wrapped.push(current);
        // Avoid a single orphaned word on the last line: move one word down
        // from the line above when both lines still fit.
        var last = wrapped.length - 1;
        if (last > 0 && !/\s/.test(wrapped[last])) {
            var words = wrapped[last - 1].split(" ");
            if (words.length > 2) {
                var moved = words.pop() + " " + wrapped[last];
                if (fits(moved)) {
                    wrapped[last - 1] = words.join(" ");
                    wrapped[last] = moved;
                }
            }
        }
        lines = lines.concat(wrapped);
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
    colorBaseline: "--color-baseline",
    colorChartPanel: "--color-chart-panel",
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
    colorPetCatsMidLight: "--color-pet-cats-mid-light",
    colorPetCatsMidDark: "--color-pet-cats-mid-dark",
    colorPetCatsLight: "--color-pet-cats-light",
    colorPetCatsDark: "--color-pet-cats-dark",
    fontHeading: "--font-heading",
    fontBody: "--font-body"
};

// Give one chart the site's colours and fonts before it is drawn.
// It looks at every setting (signal) in the chart. If the setting's name is
// in the list above, it reads the matching value from style.css and puts it
// in place of the backup value written in the chart file.
function applyTheme(spec, hostWidth) {
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
        if (signal.name === "legendTextSize") {
            var shrink = hostWidth > 0 ? Math.min(1, hostWidth / 344) : 1;
            signal.value = (parseFloat(styles.getPropertyValue("--legend-text-size")) || 13) / shrink;
        }
        if (signal.name === "legendTextWeight") {
            signal.value = parseInt(styles.getPropertyValue("--legend-text-weight"), 10) || 400;
        }
        // Only replace the backup if style.css really has a value.
        if (value) {
            signal.value = value;
        }
    });
    // Vega expressions run after layout, so wrapping uses the final plot width.
    if (spec.title) {
        var title = spec.title;
        // One title size and one subtitle size for every chart, from style.css,
        // so similar text matches across the page whatever the chart's width.
        var titleSize = parseFloat(styles.getPropertyValue("--chart-title-size")) || 22;
        var subtitleSize = parseFloat(styles.getPropertyValue("--chart-subtitle-size")) || 13;
        // Charts narrower than 344 pixels are drawn at 344 and scaled down to
        // fit; enlarge their titles by the same factor so they appear equal.
        var shrink = hostWidth > 0 ? Math.min(1, hostWidth / 344) : 1;
        titleSize /= shrink;
        subtitleSize /= shrink;
        title.fontSize = titleSize;
        title.subtitleFontSize = subtitleSize;
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
        title.lineHeight = Math.round(titleSize * 1.25);
        title.subtitleLineHeight = Math.round(subtitleSize * 1.3);
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
            controlNames[container] = (spec.signals || []).filter(function(s) { return s.bind || persistentSignals.includes(s.name); }).map(function(s) { return s.name; });
            (spec.signals || []).forEach(function(s) {
                if (controlValues[container] && Object.prototype.hasOwnProperty.call(controlValues[container], s.name)) s.value = controlValues[container][s.name];
            });
            host.setAttribute("aria-label", spec.description || "Data chart");
            return document.fonts.ready.then(function() {
                return vegaEmbed(container, applyTheme(spec, host.getBoundingClientRect().width), embedOptions);
            }).then(function(result) {
                // Long sentence tooltips must stay inside a narrow viewport,
                // even when the default handler flips them left of the pointer.
                var showTooltip = result.view.tooltip();
                result.view.tooltip(function(handler, event, item, value) {
                    showTooltip.call(this, handler, event, item, value);
                    var popup = document.getElementById("vg-tooltip-element");
                    if (!popup || !popup.classList.contains("visible")) return;
                    var bounds = popup.getBoundingClientRect();
                    popup.style.left = Math.max(10, Math.min(bounds.left, window.innerWidth - bounds.width - 10)) + "px";
                    popup.style.top = Math.max(10, Math.min(bounds.top, window.innerHeight - bounds.height - 10)) + "px";
                });
                // Titles wrap to the fitted width, which is only known after the
                // first layout. If that adds a line, more layout passes make room
                // for it, so the title is never pushed above the chart. Repeat
                // until the chart's size stops changing (at most three passes).
                function settle(passesLeft) {
                    var before = result.view.width() + "x" + result.view.height() + "@" + result.view.origin();
                    return result.view.resize().runAsync().then(function(view) {
                        var after = view.width() + "x" + view.height() + "@" + view.origin();
                        var svg = document.querySelector(container + " svg");
                        var title = svg && svg.querySelector(".role-title");
                        var titleInside = !title || title.getBoundingClientRect().top >= svg.getBoundingClientRect().top - 1;
                        return (after === before && titleInside) || passesLeft <= 1 ? result : settle(passesLeft - 1);
                    });
                }
                return settle(3);
            });
        })
        .then(function (result) {
            // Fonts are ready before embedding, so no second sizing pass is needed.
            var controlsTarget = document.getElementById(host.dataset.controlsTarget);
            var bindings = host.querySelector(".vega-bindings");
            if (controlsTarget && bindings) controlsTarget.replaceChildren(bindings);
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
    window.dispatchEvent(new Event("charts-redrawing"));
    Object.entries(chartViews).forEach(function(entry) {
        var container = entry[0], view = entry[1];
        controlValues[container] = {};
        (controlNames[container] || []).forEach(function(name) { controlValues[container][name] = view.signal(name); });
        view.finalize();
    });
    chartViews = {};
    chartJobs = [];
    // Which box on the page, and which design file goes in it.
    // Section 1: world map, then the beeswarm of 43 countries.
    embedChart("#chart1_chart", "js/world_map.vg.json");
    embedChart("#chart2_chart", "js/country_beeswarm.vg.json");
    // Section 2: how pet ownership changed from 2016 to 2025, and which
    // households own pets, followed by Australian housing distribution.
    embedChart("#chart3_chart", "js/ownership_trend.vg.json");
    embedChart("#chart4_chart", "js/household_groups.vg.json");
    embedChart("#chart5_chart", "js/au_housing_density.vg.json");
    // Section 3: which pets Australians keep, and why they chose them.
    embedChart("#chart6_chart", "js/pet_types.vg.json");
    embedChart("#chart7_chart", "js/motivations.vg.json");
    // Section 4: what pets cost, and what stops people getting one.
    embedChart("#chart8_chart", "js/spending_tree.vg.json");
    embedChart("#chart9_chart", "js/barriers.vg.json");
    // Section 5: linked dog/cat maps compare totals with resident rates; the
    // scatterplot relates dog and cat rates to population density.
    embedChart("#chart10_chart", "js/sa_pet_symbols.vg.json");
    embedChart("#chart11_chart", "js/sa_councils_map.vg.json");
    embedChart("#chart12_chart", "js/density_scatter.vg.json");
    embedChart("#chart13_chart", "js/council_distribution.vg.json");
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
// Equal source blocks put their divider and first text line at the same height.
// Map headings and grey hosts also share heights, without changing map scales.
function alignPairedDetails() {
    document.querySelectorAll(".shared-pet-panels, .map-pair").forEach(function(pair) {
        function equalHeight(selector) {
            var elements = Array.from(pair.querySelectorAll(selector));
            elements.forEach(function(element) { element.style.minHeight = ""; });
            if (!sideLayout.matches || elements.length !== 2) return;
            var height = Math.ceil(Math.max.apply(null, elements.map(function(element) {
                return element.getBoundingClientRect().height;
            })));
            elements.forEach(function(element) { element.style.minHeight = height + "px"; });
        }
        equalHeight(".chart-source");
        if (pair.classList.contains("map-pair")) {
            equalHeight(".chart-heading");
            equalHeight(".chart-subtitle");
            equalHeight(".chart-figure > [id^='chart']");
            pair.querySelectorAll(".chart-figure > [id^='chart']").forEach(function(host) {
                host.style.background = sideLayout.matches ? "var(--color-chart-panel)" : "";
            });
        }
    });
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
        // This pair shares a frame: align the grey panels rather than captions,
        // whose different line counts otherwise leave the bump chart shorter.
        if (pair.classList.contains("shared-pet-panels")) {
            var svg = host.querySelector("svg");
            var partnerSvg = partners[0] && partners[0].querySelector("svg");
            if (svg && partnerSvg && sideLayout.matches) {
                var box = svg.getBoundingClientRect();
                var scale = box.height / Number(svg.getAttribute("height")) || 1;
                next = Math.max(0, Math.round(extra +
                    (partnerSvg.getBoundingClientRect().bottom - box.bottom) / scale));
            } else next = 0;
        }
        // Vega's resize resets the SVG's inline style, so repaint its panel after.
        if (Math.abs(next - extra) > 1) view.signal("extraHeight", next).runAsync().then(function() {
            requestAnimationFrame(function() { alignSideText(); paintChartPanels(); });
        });
    });
}
// Side rows: the finding beside a chart starts level with the top of the
// chart's content (its plot, map or tree), below the chart title, so the
// title heads the chart alone. Titles differ in height and wrap with width,
// so the offset is measured after drawing. Stacked rows need no offset.
var sideLayout = window.matchMedia("(min-width: 1101px)");
function chartContentTop(figure) {
    var svg = figure.querySelector("svg");
    if (!svg) return null;
    // A chart with an HTML title (the housing map) starts where its SVG starts.
    if (!svg.querySelector(".role-title")) return svg.getBoundingClientRect().top;
    var top = Infinity;
    svg.querySelectorAll("path, text, line, rect, circle").forEach(function(shape) {
        if (shape.closest(".role-title") || shape.closest(".background")) return;
        var box = shape.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) top = Math.min(top, box.top);
    });
    return isFinite(top) ? top : null;
}
function alignSideText() {
    document.querySelectorAll(".row-side").forEach(function(row) {
        var narrative = row.querySelector(".narrative");
        var figure = row.querySelector(".chart-figure");
        var top = sideLayout.matches && figure ? chartContentTop(figure) : null;
        narrative.style.paddingTop = top === null ? "" :
            Math.max(0, Math.round(top - figure.getBoundingClientRect().top)) + "px";
        var details = narrative.querySelector(".housing-map-details");
        if (details) {
            details.style.marginTop = "";
            var map = figure.querySelector("svg");
            if (sideLayout.matches && map) {
                var gap = map.getBoundingClientRect().bottom - details.getBoundingClientRect().bottom;
                if (gap > 0) details.style.marginTop = (18 + gap) + "px";
                else if (gap < -1) {
                    var view = chartViews["#chart5_chart"];
                    var scale = map.getBoundingClientRect().height / Number(map.getAttribute("height")) || 1;
                    if (view) view.signal("sidebarExtraHeight", view.signal("sidebarExtraHeight") - gap / scale)
                        .runAsync().then(scheduleFill);
                }
            }
        }
    });
}
// Chart panels: every chart sits on the same light grey as the maps, but the
// grey starts just above the chart's content, so its title and subtitle stay
// on the white card (as the maps' HTML titles do). It is a CSS background on
// the chart's own SVG, so hover redraws inside the chart keep it.
function paintChartPanels() {
    document.querySelectorAll(".chart-figure svg").forEach(function(svg) {
        var box = svg.getBoundingClientRect();
        var title = svg.querySelector(".role-title");
        var start = 0;
        if (title) {
            var content = chartContentTop(svg.closest(".chart-figure"));
            start = Math.max(title.getBoundingClientRect().bottom + 4,
                (content === null ? box.top : content) - 12) - box.top;
        }
        start = Math.max(0, Math.round(start));
        svg.style.background = "linear-gradient(to bottom, transparent " + start +
            "px, var(--color-chart-panel) " + start + "px)";
    });
    if (sideLayout.matches) {
        var paired = Array.from(document.querySelectorAll(".shared-pet-panels .chart-figure svg"));
        if (paired.length === 2) {
            var top = Math.max.apply(null, paired.map(function(svg) {
                return svg.getBoundingClientRect().top + parseFloat(svg.style.background.match(/transparent ([\d.]+)px/)[1]);
            }));
            paired.forEach(function(svg) {
                var start = top - svg.getBoundingClientRect().top;
                svg.style.background = "linear-gradient(to bottom, transparent " + start +
                    "px, var(--color-chart-panel) " + start + "px)";
            });
        }
    }
}
var fillFrame;
function scheduleFill() {
    cancelAnimationFrame(fillFrame);
    fillFrame = requestAnimationFrame(function() {
        alignPairedDetails();
        fillPairedCards();
        alignSideText();
        paintChartPanels();
    });
}
if (sideLayout.addEventListener) sideLayout.addEventListener("change", scheduleFill);
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
