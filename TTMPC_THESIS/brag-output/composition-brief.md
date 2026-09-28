# Hyperframes Composition Brief: REGANT (TTMPC Decision Support System)

## Objective
Create a short launch-style brag video for REGANT, a decision-support system built for a real teachers' cooperative (TTMPC).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 19s target (15-25s range)

## Source Material
- Project root: `TTMPC_THESIS/`
- Primary files read: `index.html`, `src/index.css`, `README.md`, `package.json`, `src/Router.jsx`, `src/Index_Pages/role_selection.jsx`, `src/Index_Pages/login.jsx`, `src/components/CreditRisk/CreditRiskPage.jsx`, `src/components/LoanDemandForecastCard.jsx`, `src/Bookkeeper/Components/MIGS.jsx`
- Product name: REGANT (the app title in the UI is "TTMPC Member Portal" / cooperative branding; README calls the system REGANT)
- Tagline / strongest claim: "Built like production. Graded like a thesis." (brag-authored, grounded in the fact that this thesis project ships 8 real role portals, a live ML risk queue, a demand forecast, and an automated scoring engine)
- Key UI or visual moment to recreate: the Credit Risk queue's RED/AMBER/GREEN traffic-light chips, the Loan Demand Forecast area+line chart with ₱-compact axis labels, and the MIGS score meter's red→green threshold flip at 50
- Copy that must appear verbatim:
  - "This is a thesis project."
  - "Built like production. Graded like a thesis."

## Creative Direction
- Tone preset: default
- Creative direction: a small-town teachers' co-op thesis project that quietly became real, serious fintech software — earnest pride, not parody
- Interpretation: playful but not silly pacing; clean crossfades/soft wipes; enough hold time to read every chip/stat; cooperative green carries the palette instead of generic AI-blue
- Angle: This is a thesis project that doesn't look like one. It has the shape of production fintech software: real role-based access control, a live risk-scored loan queue, a 12-month demand forecast in pesos, and an automated member grading engine — all serving one small-town teachers' co-op.
- Hook: Real TTMPC role-selection screen (Member/Staff cards, logo) with "This is a thesis project." slammed over it.
- Outro / punchline: TTMPC wordmark on a cooperative-green field, "Built like production. Graded like a thesis."
- Avoid:
  - Generic SaaS language ("streamline your workflow", etc.)
  - Abstract filler visuals / generic AI-blue gradients
  - Unrelated visual redesign — colors and type must stay traceable to the real app

## Visual Identity
- Background: `#F8FAFC` (light slate, app shell) for UI scenes; `#1D6021` → `#389734` deep-green field for hook/outro cards
- Text: dark gray (`#1F2937`-range) on light scenes; white on green field scenes
- Accent: `#389734` (Cooperative Green, primary), `#2e7a2a` (Primary — Deep), `#66B538` (bright interactive green used on login/role-selection focus states)
- Display font: Poppins, extrabold/800-900 for hero lines (matches the app's own heading weights)
- Body font: Poppins, 400-600
- Visual references from the project:
  - Role selection screen: TTMPC logo, "Select Your Role", two rounded cards (Member / Staff) with soft green icon chips
  - Credit Risk queue table: green gradient header (`from-green-700 to-green-600`), rows with RED/AMBER/GREEN risk badges (`bg-red-100 text-red-700`, `bg-amber-50 text-amber-700`, `bg-emerald-100 text-emerald-700`)
  - Forecast chart: recharts ComposedChart, Area + Line, ₱-compact axis ticks (₱850k, ₱4.3M style), distinct colors per loan type (consolidated/emergency/bonus)
  - MIGS meter: horizontal score bar 0-100, fill color flips to `#2C7A3F`-range green once it crosses 50, red (`bg-red-400`) below threshold

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 2.5s — real role-selection screen + "This is a thesis project." slammed over it
2. Credit Risk highlight — 4.5s — green-gradient table header locks in, 3 loan rows land one by one each with a RED/AMBER/GREEN chip, caption "Scores default risk in real time."
3. Forecast highlight — 4.5s — 12-month area+line chart draws left-to-right, ₱-compact figures tick in, caption "Forecasts loan demand 12 months out."
4. MIGS highlight — 4s — score meter fills and flips red→green at the 50-point threshold, caption "Grades every member automatically."
5. Outro — 3.5s — cooperative-green field, TTMPC wordmark locks center, tagline "Built like production. Graded like a thesis." + subtext "REGANT — Tubungan Teachers' Multi-Purpose Cooperative."

## Audio
- Audio role: warm, clean bed with sparse professional accents — confident, not hyped
- Audio arc: fades in under the hook at low presence, holds steady groove through the three highlight scenes, settles and fades out under the outro tagline
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (mid-energy, slightly laid-back, ~114.84 BPM)
- Music treatment: start at 0s, volume ~0.32 (never above 0.4), gentle fade-in under the hook, fade-out in the final ~1s of the outro
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.{md,json}`. Notable strong cues in the 0-25s planning window: 3.70s, 4.23s, 5.28s, 6.34s, 7.92s, 8.44s, 10.54s, 11.60s, 12.65s, 23.17s. Suggested (non-binding) targets: scene 1→2 transition near 3.70s; row reveals in scene 2 near 4.23-6.34s; chart draw-in start in scene 3 near 10.54s; MIGS threshold flip in scene 4 near 12.65s. Use ±0.15s for major moments, ±0.10s for small entrances; skip any cue that hurts readability or pacing.
- Audio-reactive treatment: subtle — let the green field on the hook/outro scenes breathe slightly with music RMS/bass (background warmth or a soft glow), nothing else. No waveform/equalizer visuals, no strobing.
- Audio-coupled moments:
  - Scene 1 hook text landing — soft pop/drop accent under the text slam
  - Scene 2 row-by-row chip reveals — accent the first and last row's arrival; let the middle row ride the music
  - Scene 3 chart draw-in — a light rising whoosh timed to the draw-in start
  - Scene 4 MIGS threshold flip — a small positive tick exactly as the bar crosses 50 and changes color
  - Scene 5 logo lock — a single bell/impact accent, music fades under it
- SFX selection guidance: moderate posture, 4-5 total cues, motion-matched to real UI actions (row pop-in, chip lock, chart draw, meter fill/flip, logo payoff). No glitch/chaotic families — this represents a real financial tool.
- SFX analysis guidance: read `<skill-dir>/assets/sfx/sfx-analysis.md`; prefer low/medium high-frequency-risk files since several cues repeat across scenes 2-4.
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the chosen music into `brag-output/composition/assets/music/`; Hyperframes copies any SFX it selects into the same `assets/` tree.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). `/brag` is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo/launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (the Credit Risk queue, the forecast chart, and the MIGS meter all qualify — use all three as planned).
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Ignore cues that hurt readability, scene pacing, or the product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to nearby beat points within about 0.10s. Use only 1-3 strong cue locks.
- Use SFX to support motion and interaction: card/row sounds for the risk-chip reveals, a short announcement cue for the MIGS threshold payoff, and restraint elsewhere.
- Honor the planned fade-in under the hook and fade-out under the outro.
- Use the Hyperframes audio-reactive workflow for the subtle green-field breathing described above; if extraction is unavailable, skip it and note why — do not block the render.
- Use local assets for audio and any required runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate.
