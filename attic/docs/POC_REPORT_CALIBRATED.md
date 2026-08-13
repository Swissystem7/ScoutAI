# ScoutAI PoC v3 — Calibrated Multi-League

5 competitions, 1022 players. NOW with per-competition league-strength coefficients + men/women SEGMENTED (different physical baselines never merged). Data: StatsBomb Open Data.

## Men — top 20 (league-strength calibrated)

1. **Raphael Dias Belloli** (Brazil, WorldCup2022) — idx 53.6
2. **Mateo Kovačić** (Croatia, WorldCup2022) — idx 48.58
3. **Jonas Hofmann** (Germany, WorldCup2022) — idx 47.88
4. **Rodrygo Silva de Goes** (Brazil, WorldCup2022) — idx 47.12
5. **Stephen Antunes Eustáquio** (Canada, WorldCup2022) — idx 44.4
6. **Rodrigo Javier De Paul** (Argentina, WorldCup2022) — idx 44.36
7. **Alistair Johnston** (Canada, WorldCup2022) — idx 43.92
8. **Nicolás Alejandro Tagliafico** (Argentina, WorldCup2022) — idx 43.32
9. **Granit Xhaka** (Switzerland, WorldCup2022) — idx 43
10. **Ángel Fabián Di María Hernández** (Argentina, WorldCup2022) — idx 42.58
11. **Piero Martín Hincapié Reyna** (Ecuador, WorldCup2022) — idx 42.28
12. **Mathías Olivera Miramontes** (Uruguay, WorldCup2022) — idx 42.09
13. **Azzedine Ounahi** (Morocco, WorldCup2022) — idx 41.81
14. **Weston McKennie** (United States, WorldCup2022) — idx 41.03
15. **Moisés Isaac Caicedo Corozo** (Ecuador, WorldCup2022) — idx 40.5
16. **Edmond Fayçal Tapsoba** (Bayer Leverkusen, Bundesliga_2023_24) — idx 39.9
17. **Luka Modrić** (Croatia, WorldCup2022) — idx 39.53
18. **Odilon Kossonou** (Bayer Leverkusen, Bundesliga_2023_24) — idx 38.78
19. **Sofyan Amrabat** (Morocco, WorldCup2022) — idx 38.45
20. **Enzo Fernandez** (Argentina, WorldCup2022) — idx 38.26

## Women — top 20 (ranked separately)

1. **Francesca Kirby** (Chelsea FCW) — idx 54.18
2. **Ingrid Filippa Angeldal** (Manchester City WFC) — idx 50.16
3. **Kirsty Hanson** (Aston Villa W) — idx 50.08
4. **Heather Payne** (Everton LFC) — idx 49.12
5. **Jessica Ziu** (West Ham United LFC) — idx 48.35
6. **Geyse da Silva Ferreira** (Manchester United W) — idx 47.57
7. **Katrina Gorry** (West Ham United LFC) — idx 46.1
8. **Kenza Dali** (Aston Villa W) — idx 45.52
9. **Emma Stina Blackstenius** (Arsenal WFC) — idx 45.41
10. **Kit Graham** (Tottenham Hotspur Women) — idx 44.33
11. **Ashleigh Neville** (Tottenham Hotspur Women) — idx 44.19
12. **Laura Madison Blindkilde Brown** (Aston Villa W) — idx 44.13
13. **Emma Harries** (West Ham United LFC) — idx 43.92
14. **Shannon O’Brien** (Leicester City WFC) — idx 43.82
15. **Erin Cuthbert** (Chelsea FCW) — idx 43.24
16. **Eve Perisset** (Chelsea FCW) — idx 43.22
17. **Nicoline Sørensen** (Everton LFC) — idx 43.12
18. **Deanne Cynthia Rose** (Leicester City WFC) — idx 42.96
19. **Celin Bizet Ildhusøy** (Tottenham Hotspur Women) — idx 42.62
20. **Catherine Joan Bott** (Leicester City WFC) — idx 42.5

## Method
leagueStrength.js: WC2022/UCL=1.0, Bundesliga=0.95, CopaAmerica=0.88, WSL=0.90(women). Engine surfaces genuine elite creators (Raphinha/Kovačić/Rodrygo/De Paul) and real WSL standouts (Kirby/Angeldal) — no cross-gender contamination.