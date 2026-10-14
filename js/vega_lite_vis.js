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

function embedChart(container, specUrl) {
    fetch(specUrl)
        .then(function (response) { return response.json(); })
        .then(function (spec) { return vegaEmbed(container, applyTheme(spec), embedOptions); })
        .then(refitAfterFonts)
        .catch(console.error);
}

embedChart("#chart3_chart", "js/ownership_trend.vg.json");
embedChart("#chart5_chart", "js/pet_types.vg.json");
embedChart("#chart7_chart", "js/motivations.vg.json");
embedChart("#chart8_chart", "js/household_groups.vg.json");
