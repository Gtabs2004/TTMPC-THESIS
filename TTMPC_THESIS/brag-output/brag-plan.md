# Brag Plan: REGANT (TTMPC Decision Support System)

## What is this app?
REGANT is a web-based decision support system for a real teachers' cooperative (TTMPC) that runs loans, savings, and membership across 8 staff role portals — with a logistic-regression credit risk model, a SARIMAX loan-demand forecast, and an automated MIGS multi-criteria scoring engine built directly into the daily workflow, not bolted on as a report.

## The angle
This is a thesis project that doesn't look like one. It has the shape of production fintech software: real role-based access control, a live risk-scored loan queue, a 12-month demand forecast in pesos, and an automated member grading engine — all serving one small-town teachers' co-op. The angle: "built like production, graded like a thesis."

## Hook (first 2-3 seconds)
Open on the real TTMPC role-selection screen (Member / Staff cards, green branding, the actual logo) — then a bold line slams over it: "This is a thesis project." The contrast between the plain, real login moment and that flat claim is the joke and the hook.

## Key moments (the middle)
- The Credit Risk queue (`CreditRiskPage.jsx`): loan rows populate one by one, each landing with a RED / AMBER / GREEN traffic-light chip — a live, color-coded default-risk read on real applications, not a spreadsheet.
- The Loan Demand Forecast chart (`LoanDemandForecastCard.jsx`): a recharts area+line chart draws in with a 12-month horizon and ₱-formatted figures (e.g. ₱850k, ₱4.3M), consolidated/emergency/bonus loan types color-separated.
- The MIGS score meter (`Bookkeeper/Components/MIGS.jsx`): a 0–100 score bar fills and flips from red to the cooperative green the instant it crosses the 50-point threshold — visualizing the automated multi-criteria evaluation replacing manual scoring.

## Outro / punchline
Cut to the TTMPC wordmark on a clean cooperative-green field. Tagline: "Built like production. Graded like a thesis." Small subtext: "REGANT — Tubungan Teachers' Multi-Purpose Cooperative." Logo payoff sound lands here.

## User flow worth showing
Staff enters through role selection → picks a role and lands on a live, ML-backed workspace (the Credit Risk queue scoring real applications) → sees the automated outputs a human used to compute by hand (risk band, 12-month demand forecast, MIGS classification). This is entry → key action (open the risk-scored queue) → result (color-coded, automated decision support on screen). Centerpiece scenes are the actual routed components (CreditRiskPage, LoanDemandForecastCard, MIGS.jsx), not marketing copy about them.

## Tone
- Preset: default
- Creative direction: a small-town teachers' co-op thesis project that quietly became real, serious fintech software — earnest pride, not parody
- Interpretation: playful but not silly pacing, clean crossfades/wipes, room for each stat/chip to be read, cooperative green carries the whole video instead of a generic AI-blue palette

## Format: landscape — 1920x1080
## Duration: 19s target (15–25s range)

## Visual identity (from the project)
- Background: `#F8FAFC` (light slate, app shell) with a `#1D6021`/`#389734` deep-green field for hook/outro cards
- Accent: `#389734` (Cooperative Green primary), `#2e7a2a` (Primary — Deep), `#66B538` (bright interactive green used on login/role-selection focus states and CTAs)
- Text: `#1F2937`-range dark gray on light scenes; white on green field scenes
- Display font: Poppins (extrabold/800–900 weights for hero lines — the app itself uses Poppins at 700–800 for headings)
- Body font: Poppins (400–600)
- Strongest visual element: the RED/AMBER/GREEN traffic-light risk chips against the app's green gradient table header (`from-green-700 to-green-600`), plus the ₱-denominated forecast chart

## Share copy (draft)
We gave a small teachers' cooperative a real decision-support system — live credit risk scoring, 12-month loan demand forecasting, and automated MIGS evaluation, running across 8 staff roles. Thesis project, production instincts. 🌱


## Audio direction
- Role: warm, clean bed with sparse professional accents — the video should feel confident, not hyped
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (mid-energy, slightly laid-back; fits `default` without pushing into startup-hype territory)
- Music treatment: start at 0s under the hook, volume ~0.32, gentle presence build into the highlights, soft fade in the last ~1s of the outro
- Music cue guidance: preset read from `happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.md` (tempo ≈114.84 BPM). Target strong cues near 3.70s (hook→highlight-1 transition), 6.34s / 8.44s (risk-chip reveals inside highlight 1), 10.54s (chart draw-in start), 12.65s (MIGS meter fill). Treat these as ±0.15s guidance, never at the expense of readability.
- Audio-reactive treatment: subtle — let the green field on hook/outro breathe slightly with music RMS; no waveform/equalizer visuals
- SFX posture: moderate, 4-5 cues total, motion-matched to real UI actions (table row pop-in, chip landing, chart draw, meter fill, logo payoff)
- Audio-coupled moments: risk-chip rows arriving one by one (accent first + last row), chart line drawing left-to-right, MIGS meter fill completing, outro logo lock
- Restraint rule: no glitch/chaotic SFX families — this is a real financial tool for a real cooperative, not a parody; keep every cue clean and confident

## Storyboard

### Scene 1 — Hook — 2.5s
Real TTMPC role-selection screen fills the frame (logo, "Select Your Role", Member/Staff cards on `#F8FAFC`). Bold Poppins-extrabold line slams in over a soft dark scrim: "This is a thesis project."
Sequential/interaction: none
Audio intent: quiet confidence, a single dry beat under the text landing — not a joke sting
Audio-coupled idea: text lands with a soft `interface/drop_001`-style pop at ~0.3s
Music: bed fades in under the scene, low presence
Transition mood: clean crossfade → Scene 2

### Scene 2 — Highlight 1 (Credit Risk) — 4.5s
Cut into the real Credit Risk queue (`CreditRiskPage.jsx`): the green-gradient table header locks in, then 3 loan rows land one by one, each getting its RED / AMBER / GREEN risk chip as it settles. Text caption arrives after the second row: "Scores default risk in real time."
Sequential/interaction: yes — 3 rows pop in one by one (roughly one per beat window near 3.70–5.28s), each landing with its risk chip; accent the first and third row's arrival with sound, let the middle ride the music
Audio intent: build a light sense of "it's working," businesslike not dramatic
Audio-coupled idea: card/row pop sound on row 1 and row 3 arrival; chip color lock gets a tiny, distinct tick
Music: full presence, steady groove
Transition mood: soft wipe → Scene 3

### Scene 3 — Highlight 2 (Forecast) — 4.5s
The Loan Demand Forecast chart (`LoanDemandForecastCard.jsx`) draws in left-to-right: area + line rendering across a 12-month horizon, ₱-compact axis labels (e.g. ₱850k, ₱4.3M) ticking into place, consolidated/emergency/bonus series colored distinctly. Caption: "Forecasts loan demand 12 months out."
Sequential/interaction: yes — the chart line/area draws left→right as one continuous reveal (not item-by-item); treat the draw-in as a single sequential motion
Audio intent: forward momentum, a light rising quality as the line draws
Audio-coupled idea: soft whoosh/rising accent timed to the draw-in start (~10.54s cue), settling as the chart completes
Music: sustained energy, no dip
Transition mood: soft wipe → Scene 4

### Scene 4 — Highlight 3 (MIGS) — 4s
The MIGS score meter (`MIGS.jsx`) fills from empty, bar climbing toward its value; at the 50-point threshold it flips from red to the cooperative green (`#2C7A3F`-range) as it locks in. Caption: "Grades every member automatically."
Sequential/interaction: yes — meter fill is a single continuous fill-and-flip, timed to complete near the 12.65s strong cue
Audio intent: a small payoff — the color flip is the mini-reveal of this scene
Audio-coupled idea: a light positive tick exactly as the bar crosses the threshold and flips color
Music: begins settling toward the outro
Transition mood: clean crossfade → Scene 5

### Scene 5 — Outro / Punchline — 3.5s
Cut to a clean cooperative-green field (`#1D6021`→`#389734`). TTMPC wordmark/logo locks center. Tagline arrives: "Built like production. Graded like a thesis." Small subtext beneath: "REGANT — Tubungan Teachers' Multi-Purpose Cooperative."
Sequential/interaction: none
Audio intent: warm, settled landing — the confident close, not a punchline sting
Audio-coupled idea: single bell/impact accent on logo lock, music fades under it in the final ~1s
Music: fades out
Transition mood: — (final scene)

**Music mood for this video:** upbeat, clean, corporate-adjacent but warm — steady rather than hyped
**Audio summary:** A mid-energy bed carries the whole video at moderate volume with 4-5 restrained, motion-matched cues (row pop-ins, chart draw whoosh, MIGS threshold tick, outro logo bell), fading in under the hook and out under the final tagline — confident, not chaotic, appropriate for a real financial tool.
