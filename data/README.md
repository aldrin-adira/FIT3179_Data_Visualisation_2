# Data inventory

`selected/` contains the ten data files requested by the active chart specifications.

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
| `au_barriers_2025.csv` | Barrier comparisons. |
| `sa_council_animals_per_1000_residents_2025.csv` | Local proportional-symbol map, council rate map and density scatterplot. |
| `sa_council_boundaries_2025.geojson` | Local map geometry and council centroids for symbol placement. |

Source IDs, dates and report-page fields remain in the supplied CSVs. Full source citations and methodological limits are in the website's sources footer.

## Proportional-symbol map

`js/sa_pet_symbols.vg.json` joins recorded-at-home dog or cat totals to council boundaries by council code. One circle represents each council, positioned at its projected geographic centroid. A zero-based linear scale shared across both species maps animal totals to symbol area: twice the count produces twice the circle area. The same scale draws the size legend. Both maps start over the settled south; shared controls can show all 68 municipal councils, Adelaide or a selected council.

Hovering over a circle shows the council name, selected species total, resident population and animals per 1,000 residents. Transparency, outlines and drawing larger circles first help distinguish overlaps. Hover and council selection link both maps with the density scatterplot, changing emphasis without changing circle area.

The circle centres represent councils, not animal addresses or neighbourhood observations. Both local maps switch between dogs and cats together and share pan and zoom. No dot-position file or custom placement helper is needed.
