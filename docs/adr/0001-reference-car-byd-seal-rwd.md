# 0001. Reference car is the BYD Seal RWD 82.5 kWh (EU "Design" / SG "Premium", MY23-26)

Status: accepted
Decided-by: answerer (researched)
Question: PH1-Q1. Which specific production EV trim (BYD or Tesla, per brief §8) should be our "reference car", the source of the fictional vehicle's parameters and the targets for the "Believable physics" goal (0-100 km/h, range at steady 100 km/h, 10-80% DC charge time within ±10%, brief §4 and §12)?
Decision: The reference car is the single-motor, rear-wheel-drive BYD Seal with the 82.5 kWh LFP Blade pack (sold as "Design" in the EU/UK and "Premium" in Singapore; unchanged for MY26). Its figures below are the physics parameters and the ±10% test targets. The fictional car never carries BYD's name, logo or styling (brief §8).
Basis:
- Brief §15: "Which reference car (a specific BYD or Tesla trim) sets the physics targets? The answerer can recommend one in Phase 1 using well-published specs." Brief §8 limits it to BYD or Tesla. Brief §10 ranks correctness 1st and simplicity 5th, so a single motor with officially published power, torque, Cd, mass and battery figures wins.
- BYD publishes power, torque, 0-100, WLTP, pack kWh, Cd, kerb mass, tyre size, AC/DC kW. Tesla's public spec pages do not publish motor power or torque, usable kWh or a 10-80% time, and the Model 3 RWD (Highland) ships with several battery variants (CATL 6L/6M, LG) that have different capacities and charge curves (ev-database lists separate entries for each). The BYD Atto 3 is a FWD SUV with a slower, less sporty profile and fewer independent tests.
- Sources:
  - BYD Europe press release: https://press.bydauto.be/byd-seal-arrives-in-europe-setting-the-standard-in-breakthrough-technology-and-stunning-design (also https://media.byd.com/byd-seal-arrives-in-europe-setting-the-standard-in-breakthrough-technology-and-stunning-design/?lang=eng)
  - BYD Singapore spec sheet (14 Sep 2023): https://www.byd.com/material/byd-site/sg/product/pdf/BYD%20Seal%20Spec%20Sheet-PREVIEW%20.pdf
  - ADAC Autotest, BYD Seal Design (test car first registered 06.05.2024): https://assets.adac.de/image/upload/Autodatenbank/Autotest/at6432-byd-seal-design/byd-seal-design.pdf
  - EV Database MY23-25: https://ev-database.org/uk/car/2001/BYD-SEAL-825-kWh-RWD-Design and MY26: https://ev-database.org/car/3515/BYD-SEAL-825-kWh-RWD-Design
  - UBS teardown of the Seal 8-in-1 e-axle, as reported by Sina: https://k.sina.com.cn/article_5953190035_162d67893019015wjy.html and Tencent News: https://news.qq.com/rain/a/20241120A046AN00
  - Wikipedia (secondary): https://en.wikipedia.org/wiki/BYD_Seal
  - Carfolio (secondary): https://www.carfolio.com/byd-seal-design-798028
  - Highmotor long-distance test (motorway consumption): https://www.highmotor.com/en/Byd-Seal-313-hp-RWD-test:-we-analyze-real-world-fuel-consumption-on-the-road..html
  - EVKX charge-curve summary (search snippet only; the page blocks fetches): https://evkx.net/models/byd/seal/seal_rwd/chargingcurve/

## Parameters

Status key: O = official (manufacturer), M = independent measurement, E = estimate (not published; see note).

| # | Parameter | Value | Status | Sources (two agree unless noted) |
|---|---|---|---|---|
| 1 | Drive layout | 1 motor, rear-wheel drive, single-speed reduction | O | BYD EU press; ADAC ("Heckantrieb", "Reduktionsgetriebe") |
| 2 | Motor type | Permanent-magnet synchronous | O | BYD SG sheet; ADAC |
| 3 | Motor peak power | 230 kW | O | BYD EU press; BYD SG sheet; ADAC |
| 4 | Motor peak torque | 360 Nm | O | BYD SG sheet; ADAC; Wikipedia |
| 5 | Continuous power (type approval) | 70 kW | O | ADAC ("Dauerleistung nach Fahrzeugschein"). One source; use only for thermal derating |
| 6 | Motor max speed | 16,000 rpm | E (teardown) | UBS teardown via Sina and Tencent (one underlying study) |
| 7 | Reduction ratio | 10.81:1 | E (teardown) | UBS teardown via Sina and Tencent (one underlying study, AWD car's rear unit = same 230 kW/360 Nm motor). Cross-check: 16,000 rpm / 10.81 at r_dyn 0.335 m ≈ 187 km/h, which matches the 180 km/h limiter |
| 8 | Battery chemistry | LFP, BYD Blade, prismatic | O | BYD EU press; EV Database |
| 9 | Cells / configuration | 172 cells, 172s1p | O/M | EV Database (172s1p); BYD press release ("172 ... cells", seen in search excerpt of the byd.com copy) |
| 10 | Pack nominal voltage | 550 V (172 × 3.2 V = 550.4 V) | M | EV Database (550 V); UBS teardown (550.4 V) |
| 11 | Cell capacity | 150 Ah | E (derived) | 82.56 kWh / 550.4 V = 150 Ah |
| 12 | Gross (nominal) energy | 82.56 kWh | O | BYD SG sheet; Wikipedia. (EV Database lists 84.0 kWh nominal; ADAC measured 85.8 kWh from the wall including losses) |
| 13 | Usable energy | 82.5 kWh | O | BYD EU press; ADAC ("netto 82,5 kWh"); EV Database |
| 14 | Kerb mass | 2,055 kg (EU unladen incl. 75 kg driver: 2,130 kg) | O | BYD SG sheet; ADAC manufacturer data; Carfolio. EV Database 2,130 = 2,055 + 75. ADAC weighed 2,090 kg |
| 15 | Gross vehicle mass | 2,501 kg | O | BYD SG sheet; EV Database |
| 16 | Drag coefficient Cd | 0.219 | O | BYD EU press (0.219); ADAC (0.22); Wikipedia |
| 17 | Frontal area A | 2.30 m² | E | Not published. 0.84 × W 1.875 m × H 1.460 m (BYD dimensions). Implies CdA ≈ 0.50 m² |
| 18 | Tyres | 235/45 R19 (test car: Continental EcoContact 6Q 99V XL) | O | BYD SG sheet; ADAC |
| 19 | Wheel dynamic radius | 0.335 m | E (derived) | Unloaded 0.347 m from tyre size × ~0.965 |
| 20 | Rolling resistance Crr | 0.008 | E | Not published. Typical for an EU-label A/B low-rolling-resistance EV tyre |
| 21 | Wheelbase / L / W / H | 2,920 / 4,800 / 1,875 / 1,460 mm | O | BYD EU press; BYD SG sheet |
| 22 | Top speed | 180 km/h (limited) | O | BYD EU press; ADAC |
| 23 | **0-100 km/h (TARGET)** | **5.9 s** (band 5.31-6.49 s) | O | BYD EU press; BYD SG sheet; ADAC; EV Database |
| 24 | WLTP range / consumption | 570 km / 16.6 kWh/100 km | O | BYD EU press; BYD SG sheet; ADAC; EV Database |
| 25 | **Range at steady 100 km/h (TARGET)** | **510 km** (≈162 Wh/km from the battery; band 459-561 km) | E (derived) | No manufacturer publishes this. Two independent derivations agree: (a) EV Database mild-weather highway estimate at 110 km/h, 181 Wh/km → scaled to 100 km/h by road load ≈ 162 Wh/km → 509 km; (b) Highmotor measured ~20 kWh/100 km on Spanish motorways at 10-15 °C, no HVAC (≈120 km/h) → scaled ≈ 16.1 kWh/100 km → 512 km |
| 26 | AC on-board charger | 11 kW, 3-phase (EU) | O | BYD EU press; ADAC. (Asian markets: 7 kW) |
| 27 | DC peak power | 150 kW | O | BYD EU press; BYD SG sheet; ADAC; EV Database |
| 28 | **DC 10-80% time (TARGET)** | **37 min** (band 33.3-40.7 min) | M | BYD publishes only 30-80% (26 min EU, 32 min SG). Measured 10-80%: ADAC 39:00 (103.2 kW avg, 64 kWh added); EV Database 36 min (100 kW avg); EVKX 34:42 (99.8 kW avg). 37 min is the centre, and ±10% covers all three |

Road-load scaling used for row 25: consumption ∝ (m·g·Crr + ½·ρ·CdA·v²) with the values above (ρ = 1.2 kg/m³). F(100)/F(110) ≈ 0.90 and F(100)/F(120) ≈ 0.80.

Sanity check with these values: 360 Nm × 10.81 / 0.335 m ≈ 11.6 kN at the wheels. The rear axle is traction-limited to about 10 kN up to base speed (~75 km/h), and the car is power-limited above that, which gives about 6.0 s for 0-100. That is inside the band.

Consequences:
- The Phase 2 vehicle model uses rows 1-22 and 26-27 as its parameters. Physics reference tests (brief §11/§12) assert rows 23, 25 and 28 within ±10%.
- The range test must run at a steady 100 km/h, flat road, 20-25 °C, HVAC off, with ~0.3-0.5 kW auxiliary load, from 100% to 0% of usable energy. Changing those conditions invalidates target 25.
- Rows marked E (frontal area, Crr, wheel radius, gear ratio, motor max speed, cell Ah) are tuning parameters. If a reference test misses, adjust E rows before O rows, and record any change in a new ADR.
- The DC charge model must taper so that 10-80% averages about 95-105 kW with a 150 kW peak, and must not assume battery preconditioning (ADAC notes the car lacks it).
- The pack model is 172s LFP at 3.2 V nominal per cell, about 550 V. The "800 V platform" marketing refers to BYD's e-Platform, not the pack's nominal voltage, so do not model an 800 V pack.
- The fictional car and the paper may say "parameters derived from a published mid-size RWD LFP sedan", but they never name BYD or the Seal, and never use BYD's logos or branding (brief §8). The source list lives only in this ADR. Tests and code refer to "ADR 0001", not the brand.
- Switching reference car later means re-deriving all three targets and re-tuning, so treat this as expensive to reverse.
