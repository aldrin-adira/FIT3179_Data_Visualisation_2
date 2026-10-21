# Data inventory

`selected/` contains the eleven data files requested by the active chart specifications.

Original downloads, supporting validation tables and development tools are kept locally and excluded from version control. The website loads only `selected/`.

## Chart data

| File in `selected/` | Used by |
|---|---|
| `international_dog_cat_selected.csv` | World map, country beeswarm and country controls; 43 selected countries, 86 species-country observations. |
| `world_countries.geojson` | World map geometry. |
| `au_ownership_trend.csv` | Four national ownership surveys and replay. |
| `au_selected_demographics_2025.csv` | Household comparisons. |
| `au_pet_types_trend.csv` | Pet-type ranks across four surveys. |
| `au_motivations_top5_2025.csv` | Motivation heatmap and closing waffle charts. |
| `au_household_spending_2025.csv` | Spending dendrogram. |
| `au_barriers_2025.csv` | Barrier comparisons. |
| `sa_council_animals_per_1000_residents_2025.csv` | Both local maps, density scatterplot and council controls. |
| `sa_council_boundaries_2025.geojson` | Local map geometry and council camera extents. |
| `sa_pet_display_dots.json` | Illustrative dog/cat dot-density positions. |

Source IDs, dates and report-page fields remain in the supplied CSVs. Full source citations and methodological limits are in the website's sources footer.

## Generated display data

`selected/sa_pet_display_dots.json` contains illustrative positions generated from the council counts and boundaries. Fixed seeds reproduce the positions. Each dot represents about 250 animals, independently rounded per council and species, with at most 125 animals of display rounding error.

Dots are illustrative positions inside council boundaries, not animal addresses or neighbourhood observations. Factual inputs are preserved separately from these generated marks.
