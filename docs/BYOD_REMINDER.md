# BYOD reminder — ScoutAI

**Hard rule:** paid / commercial use of this tool requires **user-licensed data**. StatsBomb **Open Data** (and lookalike payloads) are rejected for commercial labeling.

## Rejected

- **Open Data lookalikes** — files that smell like StatsBomb Open Data (competition/season ids, Open Data provenance, WC2018 aggregates shaped as user upload)
- Selling rankings, reports, or analysis **derived from Open Data**
- Treating the free Open Data demo as a paid deliverable

## Required

- User must **license their own data** (BYOD attestation) before commercial / workshop labeling
- Synthetic example (`data/user-dataset.example.json`) is fine for teaching
- Free Open Data lab stays free with credit — never a checkout SKU

## Checklist

- [ ] BYOD path rejects Open-Data-lookalike uploads (`test/byod.test.js`)
- [ ] Workshop / offer copy: user-licensed only
- [ ] No Open Data sales language on paid path
