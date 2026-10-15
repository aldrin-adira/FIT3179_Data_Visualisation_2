// Embed each finished chart into its container in index.html.
// Add one embedChart line per chart as sections are completed.
// SVG text picks up the web fonts once they finish loading.
var embedOptions = {actions: false, renderer: "svg"};

// Chart signals named here take their values from the CSS variables in
// css/style.css, so the palette and fonts are only defined in one place.
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
    colorPetDogs: "--color-pet-dogs",
    colorPetCats: "--color-pet-cats",
    colorPetFish: "--color-pet-fish",
    colorPetBirds: "--color-pet-birds",
    colorPetSmallMammals: "--color-pet-small-mammals",
    colorPetReptiles: "--color-pet-reptiles",
    colorPetOther: "--color-pet-other",
    colorPetDogsLight: "--color-pet-dogs-light",
    colorPetDogsDark: "--color-pet-dogs-dark",
    colorPetCatsLight: "--color-pet-cats-light",
    colorPetCatsDark: "--color-pet-cats-dark",
    fontHeading: "--font-heading",
    fontBody: "--font-body"
};

function applyTheme(spec) {
    var styles = getComputedStyle(document.documentElement);
    (spec.signals || []).forEach(function (signal) {
        var property = themeSignals[signal.name];
        var value = property ? styles.getPropertyValue(property).trim() : "";
        if (value) {
            signal.value = value;
        }
    });
    return spec;
}

// Re-measure labels after the web fonts load so charts are not clipped.
function refitAfterFonts(result) {
    document.fonts.ready.then(function () {
        result.view.resize().runAsync();
    });
}

// Returns a promise of the chart's Vega view, so charts can be linked.
function embedChart(container, specUrl) {
    return fetch(specUrl)
        .then(function (response) { return response.json(); })
        .then(function (spec) { return vegaEmbed(container, applyTheme(spec), embedOptions); })
        .then(function (result) {
            refitAfterFonts(result);
            return result.view;
        })
        .catch(console.error);
}

// Keep a signal in step across two charts, for example the council under the pointer.
function linkSignal(viewPromises, signalName) {
    Promise.all(viewPromises).then(function (views) {
        views.forEach(function (source) {
            if (!source) {
                return;
            }
            source.addSignalListener(signalName, function (name, value) {
                views.forEach(function (target) {
                    if (target && target !== source && target.signal(signalName) !== value) {
                        target.signal(signalName, value).runAsync();
                    }
                });
            });
        });
    });
}

embedChart("#chart1_chart", "js/world_map.vg.json");
embedChart("#chart2_chart", "js/country_beeswarm.vg.json");
embedChart("#chart3_chart", "js/ownership_trend.vg.json");
embedChart("#chart5_chart", "js/pet_types.vg.json");
embedChart("#chart7_chart", "js/motivations.vg.json");
embedChart("#chart8_chart", "js/household_groups.vg.json");
embedChart("#chart9_chart", "js/spending.vg.json");
embedChart("#chart10_chart", "js/barriers.vg.json");
// Section 6 pair: dogs in total (symbols) beside dogs per person (choropleth), with linked hover.
var dogCounts = embedChart("#chart14_chart", "js/sa_dog_symbols.vg.json");
var dogRates = embedChart("#chart11_chart", "js/sa_councils_map.vg.json");
linkSignal([dogCounts, dogRates], "hoverCode");
embedChart("#chart12_chart", "js/density_scatter.vg.json");
embedChart("#chart13_chart", "js/draws_and_limits.vg.json");
