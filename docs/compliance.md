# Compliance rules checked by `/compliance`

These are the rules this system checks your records against. Each has its source, what a breach looks like in the data, and the check that finds it. Sources were read on 20 November 2026. Rules change: confirm each one against its source before you rely on it, and when one changes, update this file and the check in `scripts/lib/vending.mjs` (`COMPLIANCE_SQL`) together.

Nothing here is legal advice. It records the rules the operator has told the system to enforce.

| Rule | Source | Breach in the data | Check |
|---|---|---|---|
| `USE_BY` | Food Standards Australia New Zealand Code, Standard 1.2.5, section 1.2.5-4: "A food must not be sold after its use-by date." FSANZ's plain-language note: foods with a use-by date "shouldn't be eaten or sold after that date". [FSANZ](https://www.foodstandards.gov.au/news/we-hear-you-lets-clear-confusion-around-food-date-labels), [Standard 1.2.5](https://www.legislation.gov.au/F2015L00401/latest/text) | A product marked `use_by` sits in a slot with stock whose earliest date is before today. | `compliance` rule `USE_BY`; `expiry` and `/attention` warn `date_warning_days` before. |
| `HEALTHY_NOT_PERMITTED` | NSW Health Guideline GL2024_011, Healthy food and drink in NSW Health facilities: it "applies to cafes, kiosks and carts, vending machines, and catering services" and "Sugar-sweetened drinks are not sold." [GL2024_011](https://www1.health.nsw.gov.au/pds/ActivePDSDocuments/GL2024_011.pdf). Other policies (`qld_health`, `nz_health`, `school`) are set per site from the policy the host gives you. | At a site with a healthy policy, a slot holds a product rated `not_permitted` or marked `sugar_sweetened`. | `compliance` rule `HEALTHY_NOT_PERMITTED` |
| `HEALTHY_SHARE` | NSW Health Guideline GL2024_011: "Everyday food and drinks make up 75% or more of the total food and drink offerings", with Occasional items no more than 25%. | At a site with a healthy policy, the share of slots holding products rated `everyday` is below the site's `everyday_min_pct` (75 for `nsw_health`; the `min_everyday_default_pct` setting when the site has none). | `compliance` rule `HEALTHY_SHARE` |
| `KJ_DISPLAY` | The host's placement agreement. NSW kilojoule display rules for chains (Fast Choices) exempt "vending machines selling pre-packaged food labelled with a nutrition information panel" ([NSW Food Authority](https://www.foodauthority.nsw.gov.au/retail/cafes-restaurants-and-retail-outlets/kJs-on-menus)), so this check is for hosts that ask for kilojoules on the machine. | At a site with `kj_display` on, a product in a slot has no `kj_per_serve` on file, so no label can be printed. | `compliance` rule `KJ_DISPLAY` |

## How products are rated

Each product carries `healthy_rating` (`everyday`, `occasional`, `not_permitted`) and `sugar_sweetened`. Rate them from the nutrient criteria in the policy that binds your hospital or school sites; the demo ratings are examples, not a ruling on any real product. Ask Claude Code to "rate our products against GL2024_011" and check its reasoning against the guideline before you save the ratings.

## Commission and GST

Commission is worked out per site from the cash and card collected in the month, on sales excluding GST (`net_sales`) or on gross sales (`gross_sales`), at the site's `commission_bps`. GST is taken out at the site's `gst_bps` (1000 in Australia, 1500 in New Zealand). This follows the agreement with each host, not a law: check it against the signed agreement.
