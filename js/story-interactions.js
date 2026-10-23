/* PAGE INTERACTIONS
   The Vega files define marks, data and scales. This file connects native
   controls to their signals, manages camera motion, and reveals sources.
   See docs/CODE_GUIDE.md for an interview-oriented map of the code. */
(() => {
    'use strict';

    // Match the operating-system preference; changes take effect immediately.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // The proportional-symbol map (totals) and rate map share one camera, species and council.
    const saIds = ['#chart9_chart', '#chart10_chart'];
    const mapIds = {sa: saIds};
    const cameraRuns = {sa: 0}; // Tokens cancel superseded camera moves.
    let species = 'Dog';
    let councilRows = [];
    let countryRows = [];
    let dataReady;

    // Look up fresh views on every action: resize replaces the old Vega views.
    const views = ids => ids.map(id => chartViews[id]).filter(Boolean);
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const number = value => new Intl.NumberFormat('en-AU').format(Math.round(value));

    // Batch changes into one Vega dataflow run per view to avoid flicker.
    function update(ids, changes) {
        return Promise.all(views(ids).map(view => {
            Object.entries(changes).forEach(([name, value]) => view.signal(name, value));
            return view.runAsync();
        }));
    }

    // Bidirectional linking skips equal values. This is essential for array
    // signals such as pan: object identity would create a feedback loop.
    function connect(ids, signalName) {
        const linked = views(ids);
        let forwarding = false; // Guard synchronous re-entry during a Vega run.
        linked.forEach(source => source.addSignalListener(signalName, (_, value) => {
            if (forwarding) return;
            forwarding = true;
            try {
                linked.forEach(target => {
                    if (target !== source && !equal(target.signal(signalName), value)) {
                        target.signal(signalName, value).runAsync();
                    }
                });
            } finally {
                forwarding = false;
            }
        }));
    }

    // Numeric values are kept in data files. Dropdown options use textContent,
    // so source labels are never interpreted as HTML.
    function addOptions(select, rows) {
        if (select.options.length > 1) return;
        rows.forEach(([code, label]) => select.add(new Option(label, code)));
    }

    // Load once with the same Vega CSV parser used by the charts. Geometry
    // supplies council extents for focus; no invented geographic locations.
    async function loadControlData() {
        const urls = [
            'data/selected/international_dog_cat_selected.csv',
            'data/selected/sa_council_animals_per_1000_residents_2025.csv',
            'data/selected/sa_council_boundaries_2025.geojson'
        ];
        const responses = await Promise.all(urls.map(url => fetch(url).then(response => {
            if (!response.ok) throw new Error('Control data unavailable: ' + url);
            return response.text();
        })));
        // Use the same full country names as the chart tooltips.
        const countryNames = {'Rep. of Moldova': 'Republic of Moldova', 'Bosnia & Herzegovina': 'Bosnia and Herzegovina'};
        countryRows = vega.read(responses[0], {type: 'csv'}).map(row => ({
            ...row, country: countryNames[row.country] || row.country
        }));
        const animals = vega.read(responses[1], {type: 'csv'});
        const shapes = JSON.parse(responses[2]).features;
        councilRows = animals.map(row => ({
            ...row, shape: shapes.find(shape => String(shape.properties.lga_code_2025) === row.lga_code_2025)
        }));
        const dogRows = councilRows.filter(row => row.species === 'Dog');
        const countries = countryRows.filter(row => row.species === 'Dogs')
            .map(row => [row.iso3, row.country]).sort((a, b) => a[1].localeCompare(b[1]));
        addOptions(document.querySelector('#country-select'), countries);
        addOptions(document.querySelector('#council-select'), dogRows
            .map(row => [row.lga_code_2025, row.shape.properties.lga_name_2025.replace(' (SA)', '')])
            .sort((a, b) => a[1].localeCompare(b[1])));
        const pets = ['Dogs', 'Cats', 'Fish', 'Birds', 'Small mammals', 'Reptiles', 'Other pets'];
        document.querySelectorAll('[data-control="pet"]').forEach(select => {
            // The motivation report has no column for 'Other pets'.
            addOptions(select, pets.filter(pet => select.id === 'pet-select' || pet !== 'Other pets').map(pet => [pet, pet]));
        });
    }

    // One named region replaces multiple simultaneous overview/inset panels.
    // Longitude/latitude are map camera settings, never additional observations.
    const regions = {
        south: [137.1, -34.9, 0.132],
        metro: [138.64, -34.96, 0.018],
        all: [137.1, -33.52, 0.184]
    };

    // Short, cancellable non-temporal animation preserves geographic context.
    // The camera changes; data values, colour classes and circle areas do not.
    async function moveCamera(scope, target, region) {
        const ids = mapIds[scope];
        const active = views(ids);
        if (!active.length) return;
        const token = ++cameraRuns[scope];
        const start = ['cameraLon', 'cameraLat', 'cameraSpan'].map(name => active[0].signal(name));
        await update(ids, {region, zoom: 1, pan: [0, 0]});
        const duration = reducedMotion.matches ? 0 : 420;
        const began = performance.now();
        async function frame(now) {
            if (token !== cameraRuns[scope]) return;
            const t = duration && !reducedMotion.matches ? Math.min(1, (now - began) / duration) : 1;
            const ease = t * t * (3 - 2 * t); // Smoothstep: no abrupt start/end.
            const changes = {};
            ['cameraLon', 'cameraLat', 'cameraSpan'].forEach((name, i) => {
                // Geometric interpolation of span makes zoom feel more even.
                changes[name] = i === 2
                    ? start[i] * Math.pow(target[i] / start[i], ease)
                    : start[i] + (target[i] - start[i]) * ease;
            });
            await update(ids, changes);
            if (t < 1 && token === cameraRuns[scope]) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        document.querySelectorAll(`[data-map-scope="${scope}"][data-map-region]`).forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.mapRegion === region));
        });
    }

    // Fit a selected council using its actual polygon's bounding coordinates.
    // A recursive traversal supports Polygon and MultiPolygon, including holes.
    function councilCamera(shape) {
        const coordinates = [];
        function collect(part) {
            if (typeof part[0] === 'number') coordinates.push(part);
            else part.forEach(collect);
        }
        collect(shape.geometry.coordinates);
        const lons = coordinates.map(point => point[0]);
        const lats = coordinates.map(point => point[1]);
        const west = Math.min(...lons), east = Math.max(...lons);
        const south = Math.min(...lats), north = Math.max(...lats);
        return [(west + east) / 2, (south + north) / 2,
            Math.max(0.004, (north - south), (east - west) * 0.85) * Math.PI / 180 * 1.45];
    }

    // Keep exact selected-council information visible without pointer hover.
    function showCouncil(code) {
        const row = councilRows.find(row => row.lga_code_2025 === code && row.species === species);
        const readout = document.querySelector('#council-readout');
        const word = species === 'Dog' ? 'dogs' : 'cats';
        readout.textContent = row
            ? `${row.shape.properties.lga_name_2025.replace(' (SA)', '')}: ${number(row.recorded_at_home_animals)} ${word} · ${number(row.recorded_animals_per_1000_residents)} per 1,000 residents · ${number(row.residents_2025)} residents`
            : 'Choose a council for its total, rate and population.';
        readout.classList.remove('control-feedback');
        void readout.offsetWidth; // Restart a brief selection-confirmation flash.
        readout.classList.add('control-feedback');
    }

    // Country readout makes exact comparison available to keyboard users.
    const countryReadout = document.createElement('p');
    countryReadout.className = 'method-note';
    countryReadout.id = 'country-readout';
    countryReadout.setAttribute('role', 'status');
    countryReadout.setAttribute('aria-live', 'polite');
    document.querySelector('#country-select').closest('.chart-toolbar').after(countryReadout);
    function showCountry(code) {
        const rows = countryRows.filter(row => row.iso3 === code);
        countryReadout.textContent = rows.length
            ? `${rows[0].country}: dogs ${rows.find(row => row.species === 'Dogs').household_ownership_pct}% · cats ${rows.find(row => row.species === 'Cats').household_ownership_pct}% of homes. Survey: ${rows[0].data_year}.`
            : 'Choose a country to highlight it in the map and both dot rows.';
    }

    // Each chart pins one meaningful observation or comparison. Existing linked
    // charts share country, pet or council focus; other charts stay independent.
    const clickTargets = {
        '#chart1_chart': {marks: ['worldPanelShapes'], key: datum => datum.iso === 'KOS' ? 'XKX' : datum.iso},
        '#chart2_chart': {marks: ['dots'], key: datum => datum.iso3},
        '#chart3_chart': {marks: ['surveyPoints', 'surveyLabels'], key: datum => datum.year},
        '#chart4_chart': {marks: ['householdPoints', 'householdSticks', 'householdLabels', 'valueLabel'], key: datum => datum.label},
        '#chart5_chart': {marks: ['rankPoints', 'rankLines', 'firstSurveyLabels', 'lastSurveyLabels'], key: datum => datum.species},
        '#chart6_chart': {marks: ['motivationCells'], key: datum => datum.species + '|' + datum.reason},
        '#chart7_chart': {marks: ['branches', 'nodeDots', 'leafNames', 'spendingLabel0', 'spendingLabel1'], key: datum => (datum.target || datum).key},
        '#chart8_chart': {marks: ['ownerBars', 'nonOwnerBars', 'ownerValues', 'rightValue', 'barrierReasons'], key: datum => datum.reason},
        '#chart9_chart': {marks: ['councilSymbols'], key: datum => datum.code},
        '#chart10_chart': {marks: ['councilAreas'], key: datum => datum.code},
        '#chart11_chart': {marks: ['councilPoints', 'calloutText'], key: datum => datum.code},
        '#chart12_chart': {marks: ['squares', 'waffleLabels'], key: datum => datum.species + '|' + datum.reason}
    };
    const connectedClickViews = new WeakSet();

    function syncPetControls(pet) {
        document.querySelectorAll('[data-control="pet"]').forEach(select => {
            select.value = [...select.options].some(option => option.value === pet) ? pet : '';
        });
    }

    async function pinSelection(id, key, datum) {
        if (id === '#chart1_chart' || id === '#chart2_chart') {
            const country = key || '';
            document.querySelector('#country-select').value = country;
            await update(['#chart1_chart', '#chart2_chart'], {pinnedKey: key, selectedCountry: country, hoverIso: null});
            showCountry(country);
        } else if (id === '#chart5_chart' || id === '#chart6_chart') {
            const pet = key === null ? '' : datum.species;
            syncPetControls(pet);
            await Promise.all([
                update(['#chart5_chart'], {pinnedKey: key === null ? null : pet, selectedPet: pet, hoverPet: null}),
                update(['#chart6_chart'], {pinnedKey: id === '#chart6_chart' ? key : null, selectedPet: pet === 'Other pets' ? '' : pet})
            ]);
        } else if ([...saIds, '#chart11_chart'].includes(id)) {
            const council = key || '';
            document.querySelector('#council-select').value = council;
            await update([...saIds, '#chart11_chart'], {pinnedKey: key, selectedCouncil: council, hoverCode: null});
            showCouncil(council);
        } else {
            const hoverSignal = {'#chart3_chart': 'hoverYear', '#chart4_chart': 'hoverGroup', '#chart7_chart': 'hoverKey', '#chart8_chart': 'hoverReason'}[id];
            const changes = {pinnedKey: key};
            if (hoverSignal) changes[hoverSignal] = null;
            await update([id], changes);
        }
    }

    function connectClickSelections() {
        Object.entries(clickTargets).forEach(([id, config]) => {
            const view = chartViews[id];
            if (!view || connectedClickViews.has(view)) return;
            connectedClickViews.add(view);
            let pointerStart;
            let dragged = false;
            // A completed map pan must not also select the council underneath.
            view.addEventListener('pointerdown', event => {
                pointerStart = [event.clientX, event.clientY];
                dragged = false;
            });
            view.addEventListener('pointermove', event => {
                if (pointerStart && event.buttons && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) dragged = true;
            });
            view.addEventListener('click', (event, item) => {
                if (dragged) { dragged = false; return; }
                const isMark = item && config.marks.includes(item.mark.name);
                if (!isMark && item && item.mark.marktype !== 'group') return;
                const datum = isMark ? item.datum : null;
                const key = isMark ? config.key(datum) : null;
                if (isMark && (key === undefined || key === null || key === '')) return;
                pinSelection(id, key, datum).catch(error => console.error(error));
            });
        });
    }

    // Persistent species focus links two different idioms without removing
    // the surrounding data, reducing the need to remember a pet's colour.
    document.querySelectorAll('[data-control="pet"]').forEach(select => {
        select.addEventListener('change', () => {
            const pet = select.value;
            document.querySelectorAll('[data-control="pet"]').forEach(other => {
                other.value = [...other.options].some(option => option.value === pet) ? pet : '';
            });
            update(['#chart5_chart'], {pinnedKey: null, selectedPet: pet});
            update(['#chart6_chart'], {pinnedKey: null, selectedPet: pet === 'Other pets' ? '' : pet});
        });
    });
    document.querySelector('#country-select').addEventListener('change', event => {
        update(['#chart1_chart', '#chart2_chart'], {pinnedKey: null, selectedCountry: event.target.value});
        showCountry(event.target.value);
    });
    document.querySelector('#council-select').addEventListener('change', event => {
        const code = event.target.value;
        update([...saIds, '#chart11_chart'], {pinnedKey: null, selectedCouncil: code});
        showCouncil(code);
        const row = councilRows.find(row => row.lga_code_2025 === code);
        moveCamera('sa', row ? councilCamera(row.shape) : regions.south, row ? 'council' : 'south');
    });

    // One switch changes the animal on both maps; camera and council stay put,
    // so the same places can be compared for dogs and cats.
    document.querySelectorAll('[data-map-species]').forEach(button => button.addEventListener('click', () => {
        species = button.dataset.mapSpecies;
        document.querySelectorAll('[data-map-species]').forEach(other => {
            other.setAttribute('aria-pressed', String(other === button));
        });
        document.querySelectorAll('[data-species-label]').forEach(el => { el.textContent = species === 'Dog' ? 'dogs' : 'cats'; });
        document.querySelectorAll('[data-species-word]').forEach(el => { el.textContent = species === 'Dog' ? 'Dogs' : 'Cats'; });
        update(saIds, {species});
        showCouncil(document.querySelector('#council-select').value);
    }));

    // Region controls provide a touch/keyboard alternative to map gestures.
    document.querySelectorAll('[data-map-region]').forEach(button => button.addEventListener('click', () => {
        const scope = button.dataset.mapScope;
        if (scope === 'sa') {
            document.querySelector('#council-select').value = '';
            update([...saIds, '#chart11_chart'], {pinnedKey: null, selectedCouncil: ''});
            showCouncil('');
        }
        moveCamera(scope, regions[button.dataset.mapRegion], button.dataset.mapRegion);
    }));

    // Footer is collapsed initially. Deep links reveal it before scrolling;
    // this also handles source anchors loaded directly from another page.
    const footerButton = document.querySelector('#footer-toggle');
    const footerContent = document.querySelector('#footer-content');
    function setFooter(open) {
        footerContent.hidden = !open;
        footerButton.setAttribute('aria-expanded', String(open));
        footerButton.innerHTML = `${open ? 'Hide' : 'View full'} sources and methods <span aria-hidden="true">${open ? '−' : '+'}</span>`;
    }
    footerButton.addEventListener('click', () => setFooter(footerContent.hidden));
    function revealHash(hash) {
        const target = document.getElementById(hash.slice(1));
        if (target && footerContent.contains(target)) {
            setFooter(true);
            requestAnimationFrame(() => {
                target.scrollIntoView({block: 'start'});
                target.setAttribute('tabindex', '-1');
                target.focus({preventScroll: true});
            });
        }
    }
    document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href^="#"]');
        if (anchor) revealHash(anchor.hash);
    });
    window.addEventListener('hashchange', () => revealHash(location.hash));
    revealHash(location.hash);

    // Reconnect newly rendered views. HTML listeners above are registered only
    // once; finalizing a Vega view releases its previous signal listeners.
    async function connectCharts() {
        try {
            dataReady ||= loadControlData();
            await dataReady;
            connectClickSelections();
            connect(['#chart1_chart', '#chart2_chart'], 'hoverIso');
            connect(saIds, 'zoom');
            connect(saIds, 'pan');
            connect([...saIds, '#chart11_chart'], 'hoverCode');
            showCountry(document.querySelector('#country-select').value);
        } catch (error) {
            document.querySelector('#council-readout').textContent = 'Map controls unavailable. The charts and source downloads remain available.';
            console.error(error);
        }
    }
    window.addEventListener('charts-ready', connectCharts);
    window.addEventListener('charts-redrawing', () => {
        cameraRuns.sa++;
    });
    if (Object.keys(chartViews).length === 12) connectCharts();
})();
