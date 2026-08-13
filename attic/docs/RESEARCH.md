# ScoutAI — Market Research
_Updated: 2026-08-11_

## Product
ScoutAI, as represented in this repository today, is a local deterministic browser demo for a transparent football scouting **Impact Score**. The UI presents a 0–100 score and its visible components (**Grit**, **Involvement**, **Clutch**) from seeded demo fixtures, while the repository also contains research and proof-of-concept material built around StatsBomb Open Data. The current demo is explicitly **not** a video-analysis system: it does not upload files, does not analyze the selected video, does not use a backend, and does not provide account, reporting, or sharing workflows.

## Market Size
- **No verified public figure found** for the exact niche of “football scouting software” from an acceptable public source.

- Closest verified public benchmark: the **global sports analytics market** was estimated at **USD 5,677.6 million in 2025** and is projected to reach **USD 23,148.4 million by 2033**, with a **18.5% CAGR from 2026 to 2033**.
  - Source: Grand View Research press release, **2026-02-12**, https://www.grandviewresearch.com/press-release/global-sports-analytics-market

- Another public benchmark for the same broader category: the **global sports analytics market** was valued at **USD 5.79 billion in 2025** and is projected to grow from **USD 7.03 billion in 2026** to **USD 31.14 billion by 2034**, with a **20.50% CAGR**.
  - Source: Fortune Business Insights, **updated 2026-07**, https://www.fortunebusinessinsights.com/sports-analytics-market-102217

- A lower external benchmark from another established research publisher: the **global sports analytics market** was **USD 1.90 billion in 2024**, is projected at **USD 2.29 billion in 2025**, and is forecast to reach **USD 4.75 billion by 2030**, with a **15.7% CAGR from 2025 to 2030**.
  - Source: MarketsandMarkets via PR Newswire, **2025-08-08**, https://www.prnewswire.com/news-releases/sports-analytics-market-worth-4-75-billion-by-2030--marketsandmarkets-302317951.html

- Interpretation note: the spread between public estimates is large, so these figures should be treated as **directional market context**, not as a validated TAM for ScoutAI specifically.

## Competitors
- **Hudl Wyscout** — https://www.hudl.com/products/wyscout  
  Football scouting and recruitment platform with large-scale match video, player search, reporting, and club workflows.  
  **How it differs from ScoutAI:** Wyscout is a production scouting platform with video and workflow infrastructure; ScoutAI is currently a browser-only local demo with no upload, no backend, and no real video analysis.

- **Hudl** — https://www.hudl.com/products  
  Sports video, coaching, and performance-analysis platform with capture, review, collaboration, and team workflows.  
  **How it differs from ScoutAI:** Hudl is built around operational team video workflows; ScoutAI currently demonstrates a transparent scorecard interface rather than a deployed coaching or analysis suite.

- **Hudl Statsbomb** — https://www.hudl.com/en_gb/products/statsbomb  
  Advanced football data product focused on event data, models, and professional analysis workflows.  
  **How it differs from ScoutAI:** StatsBomb sells professional data and analytics products; ScoutAI currently shows a transparent deterministic score in a local demo and does not expose an enterprise data service.

- **SciSports** — https://www.scisports.com/products/  
  Football analytics products for scouting, recruitment, and team analysis, including player discovery and fit-oriented workflows.  
  **How it differs from ScoutAI:** SciSports positions itself as a production analytics platform for clubs and agencies; ScoutAI currently emphasizes a simple, inspectable scoring formula rather than a full recruitment platform.

- **SkillCorner** — https://www.skillcorner.com/product/  
  Tracking-data product that derives physical and tactical information from broadcast video.  
  **How it differs from ScoutAI:** SkillCorner extracts tracking insights from actual match video; ScoutAI explicitly does not analyze the selected video at all.

- **InStat** — https://instatsport.com/football/  
  Football scouting and analysis platform combining video, statistics, and searchable player/team information.  
  **How it differs from ScoutAI:** InStat offers a live commercial database and scouting workflow; ScoutAI is currently a local deterministic demo without a searchable production database.

## Differentiation
- **Explicit provenance labeling:** the interface clearly labels `LOCAL_VIDEO`, `DEMO_METRIC`, and `VERIFIED_ANALYSIS_SERVICE`, so the user can see which parts are real, simulated, or unavailable.
- **Transparent scoring formula:** the demo shows a direct formula (`Impact = 0.4×Grit + 0.3×Involvement + 0.3×Clutch`) instead of a black-box model.
- **Offline, browser-only behavior:** the current implementation works locally, without backend processing, account creation, uploads, or outbound sharing.
- **Conservative claims in the product itself:** the UI and README explicitly state that the demo does not analyze video and is not a professional scouting service.

## What Is Still Unverified
- Whether football clubs, scouts, or agents would pay for a transparent deterministic score without integrated video, collaboration, and reporting workflows.
- Whether the current Impact Score formula is predictive or decision-useful across leagues, age groups, genders, and tactical roles.
- Whether the score remains valid when moving from open historical event data to live operational scouting workflows.
- Whether ScoutAI’s transparent-score positioning is strong enough to win attention against established platforms that already bundle video, data, and workflow tools.
- Whether there is a commercially robust path from a local demo to a product without adding ingestion, reporting, permissions, and customer support capabilities.
- Whether any productized use of StatsBomb-open-data-derived research would require additional legal, licensing, or attribution review before commercialization.
