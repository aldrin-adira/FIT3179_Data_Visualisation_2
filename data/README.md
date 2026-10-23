# Data inventory

`selected/` contains the eleven data files requested by the active chart specifications.

Original downloads, supporting validation tables and development tools are kept locally and excluded from version control. The website loads only `selected/`.

## Chart data

| File in `selected/` | Used by |
|---|---|
| `international_dog_cat_selected.csv` | World map and country beeswarm; 43 selected countries, 86 species-country observations. |
| `world_countries.geojson` | World map geometry. |
| `au_ownership_trend.csv` | Four national ownership surveys. |
| `au_selected_demographics_2025.csv` | Household comparisons. |
| `au_pet_types_trend.csv` | Pet-type ranks across four surveys. |
| `au_motivations_top5_2025.csv` | Motivation heatmap and closing waffle charts. |
| `au_household_spending_2025.csv` | Spending dendrogram. |
| `au_housing_regions_2021.geojson` | National housing dot-density map: 337 statistical regions, simplified boundaries and three Census dwelling counts. |
| `au_barriers_2025.csv` | Barrier comparisons. |
| `sa_council_animals_per_1000_residents_2025.csv` | Local proportional-symbol map, council rate map and density scatterplot. |
| `sa_council_boundaries_2025.geojson` | Local map geometry and council centroids for proportional symbols. |

Source IDs, dates and report-page fields remain in the supplied CSVs. Full source citations and methodological limits are in the website's sources footer.

## Proportional-symbol map

`js/sa_pet_symbols.vg.json` joins recorded-at-home dog or cat totals to council boundaries by council code. One circle represents each council, positioned at its projected geographic centroid. A zero-based linear scale shared across both species maps animal totals to symbol area: twice the count produces twice the circle area. The same scale draws the size legend. Both maps start over the settled south; shared controls can show all 68 municipal councils, Adelaide or a selected council.

Hovering over a circle shows the council name, selected species total, resident population and animals per 1,000 residents. Transparency, outlines and drawing larger circles first help distinguish overlaps. Hover and council selection link both maps with the density scatterplot, changing emphasis without changing circle area.

The circle centres represent councils, not animal addresses or neighbourhood observations. Both local maps switch between dogs and cats together and share pan and zoom. The separate Section 2 map shows national housing counts, with an independent home-type selector.

## National housing dot-density map

`js/au_housing_density.vg.json` uses the Australian Bureau of Statistics 2021 Census, General Community Profile table G37 (tenure and landlord type by dwelling structure), at Statistical Area Level 3. It maps occupied private dwellings excluding visitor-only and other non-classifiable households. The three options use the published fields `Total_DS_Sep_house`, `Total_DS_Flat_apart` and `Total_Total`. These count homes, not pets or pet-owning households. Housing context connects this map with the separate 2025 pet-ownership comparisons immediately above it.

Source: [Australian Bureau of Statistics Census service](https://services1.arcgis.com/v8Kimc579yljmjSP/ArcGIS/rest/services/ABS_2021_Census_G37_Beta/FeatureServer/3), downloaded 23 October 2026. The selected file contains source counts and matching boundaries, generalised by the service at 0.015 degrees and five decimal places, with ring orientation adjusted for Vega. The optional local `scripts/prepare-housing-map.cjs` reproduces the download and preparation; no build step is required to run the website.

Coverage is 337 geographic regions across the six states, the Northern Territory, the Australian Capital Territory and Jervis Bay. Christmas Island, the Cocos (Keeling) Islands and Norfolk Island are omitted from the mainland-and-Tasmania view. Eighteen records without geographic boundaries are excluded. Published regional sums may differ from national totals because of Census confidentiality adjustments and these coverage exclusions.

Each equal-size dot represents about 2,000 homes, with `round(count / 2000)` dots per region. Exact regional counts remain in tooltips, including regions rounded to zero dots. The map contains 3,355 house dots, 646 apartment dots or 4,633 all-home dots. Each option retains the same dot size and denominator.

`js/dot-map-helpers.js` generates repeatable, area-uniform positions inside statistical regions and outside polygon holes. These positions are illustrative, not actual home addresses or within-region settlement patterns. Coordinates and home-type selections persist across resizing. Counts and boundaries are served locally, with no runtime dependency on the source service. Source and licence links are in the website footer.
