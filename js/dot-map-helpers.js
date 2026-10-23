// Geographic placement for the dot-density map.
// au_housing_density.vg.json calculates the dot counts and supplies the seed.
// This helper only turns those counts into repeatable illustrative positions.
(() => {
    "use strict";

    function pointIsInsideRing(longitude, latitude, ring) {
        // A horizontal ray crosses a polygon edge each time inside flips.
        let inside = false;
        for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
            const [currentX, currentY] = ring[i];
            const [previousX, previousY] = ring[previous];
            if ((currentY > latitude) !== (previousY > latitude) &&
                    longitude < (previousX - currentX) * (latitude - currentY) /
                    (previousY - currentY) + currentX) {
                inside = !inside;
            }
        }
        return inside;
    }

    function pointIsInsidePolygon(longitude, latitude, polygon) {
        // The first ring is the outer boundary; later rings are holes.
        return pointIsInsideRing(longitude, latitude, polygon[0]) &&
            !polygon.slice(1).some(ring => pointIsInsideRing(longitude, latitude, ring));
    }

    function placeDotsInsideRegions(regions, placementSeed) {
        let seed = placementSeed;
        const dots = [];
        function nextRandomNumber() {
            // A local seeded generator: the same inputs reproduce the map.
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }

        for (const region of regions) {
            const count = region.dotCount;
            if (!Number.isInteger(count) || count < 0) {
                throw new Error("Invalid dot count for " + region.name);
            }
            if (count === 0) continue;

            const geometry = region.geometry;
            if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
                throw new Error("Missing region boundary for " + region.name);
            }
            const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
            const coordinates = polygons.flat(2);
            const longitudes = coordinates.map(point => point[0]);
            const latitudes = coordinates.map(point => point[1]);
            const west = Math.min(...longitudes);
            const east = Math.max(...longitudes);
            const south = Math.min(...latitudes);
            const north = Math.max(...latitudes);
            let placed = 0;
            let attempts = 0;

            while (placed < count) {
                // Fail visibly for unusable geometry instead of looping forever.
                if (++attempts > 1000000) {
                    throw new Error("Unable to place dots for " + region.name);
                }
                const longitude = west + nextRandomNumber() * (east - west);
                // Uniform sine(latitude) sampling accounts for spherical area.
                const latitude = Math.asin(Math.sin(south * Math.PI / 180) + nextRandomNumber() *
                    (Math.sin(north * Math.PI / 180) - Math.sin(south * Math.PI / 180))) * 180 / Math.PI;
                if (!polygons.some(polygon => pointIsInsidePolygon(longitude, latitude, polygon))) continue;

                dots.push({
                    housingType: region.housingType,
                    // Keep full precision: rounding can move a near-edge dot
                    // outside its region after the containment check.
                    longitude,
                    latitude,
                    code: region.code,
                    name: region.name,
                    count: region.count
                });
                placed++;
            }
        }
        return dots;
    }

    // Register before the loader parses the chart specification.
    // The export also lets the optional local data checks inspect placement.
    if (typeof module !== "undefined" && module.exports) {
        module.exports = {placeDotsInsideRegions};
    } else {
        vega.expressionFunction("placeDotsInsideRegions", placeDotsInsideRegions);
    }
})();
