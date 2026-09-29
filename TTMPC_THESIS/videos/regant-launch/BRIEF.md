---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "TTMPC/REGANT is a modern, integrated digital cooperative platform connecting members and cooperative officers through desktop and mobile experiences"
destination: youtube
aspect: 1920x1080
language: en
length: 40-60s
angle: connected-ecosystem showcase
narration: no
---

## Intent

Market TTMPC's REGANT platform (the Integrated Member Profiling and Financial
Decision Support System) as a modern, professional, dimensional SaaS/fintech
product launch video — not a flat slideshow or screen recording. Show it
serving two audiences at once: cooperative officers on desktop and members on
mobile, presented as one connected ecosystem rather than two separate apps.
Confident, energetic, premium — a real product launch, appropriate for an
academic thesis presentation.

## Assets

- `TTMPC_THESIS/public/img/ttmpc logo.png` — the real cooperative logo; brand mark for open/close beats.
- `TTMPC_THESIS/src/index.css` — real brand tokens: `--color-primary #389734`, `--color-primary-deep #2e7a2a`, `--color-member-green #1D6021` / dark-mode `#4ade80`, plus `#66B538` bright interactive green used on login/role-selection focus states across `src/Index_Pages/`. Body/display font: Poppins.

## Customizations

- Device mockups: pull a registry device-mockup block for the desktop and phone frames (realistic depth, shadow, reflection) instead of hand-built CSS bezels — user explicitly asked for "physical depth, realistic lighting, shadows, reflections."
- The six-act structure below is fixed by the user's own brief — fill it, do not restructure the beats or their timing bands.
- **Music: `none`.** Not signed in to HeyGen (browser/device OAuth both blocked in this terminal); user explicitly declined both the local MusicGen fallback (heavy install, slow/lower-quality CPU generation) and HeyGen sign-in, choosing SFX-only. No BGM bed, no BPM-scored build-up.
- **SFX: on, bundled library.** SFX resolution falls back automatically to `/media-use`'s bundled 19-file library with no HeyGen credential (confirmed by reading `media-use/audio/scripts/audio.mjs`) — this still works. Use subtle UI-synced SFX only on major beats (clicks, whooshes, chimes, confirmation sounds), per the user's original sound-design brief, never on every movement.
- **Consequence of no BGM:** the energy build the user's brief described as a music arc ("subtle intro → energetic dashboard → faster module tour → peak energy at device connection → clean resolution") must now be carried by **visual pacing and motion energy alone** — cut speed, camera movement intensity, and reveal density should still ramp across the six acts even though the music won't be doing that work.
- **`music: none` + no `SCRIPT.md` note (read before touching Step 3.1/5 audio):** `story-design.md` calls this combination the canonical "fully silent" marker (no narration, no BGM, no SFX) and says `audio.mjs`'s Step-3.1 `generate` call skips cleanly on it. That's correct for Step 3.1 (nothing to generate — no VO, no BGM). It does **not** mean Step 5's `fetch-sfx` should be skipped: `STORYBOARD.md` frames carry explicit `- sfx: ...` cues (verified against `media-use/audio/scripts/audio.mjs` — SFX resolution falls back to the bundled 19-file library with no HeyGen credential, independent of BGM/TTS). Run `sync-durations` and `fetch-sfx` at Step 5 as normal; only the Step 3.1 `generate` call is the clean skip.

## Notes

- **No live product URL.** TTMPC/REGANT is a local full-stack app (React 19 + Tailwind v4 frontend, FastAPI backend, Supabase) in this repo, not a hosted site. Built from direct source reading (Step 1 "no-capture" path, populated with real brand/asset data), not a headless-Chrome crawl.
- **Full six-act creative brief, verbatim, is the source of truth for `STORYBOARD.md`'s beats and timing bands** — saved at `capture/extracted/visible-text.txt`. Do not paraphrase away specifics from it (device data-flow choreography, per-act sound cues, exact section timings) — apply its sound cues as SFX-only per the Music customization above.
- No spoken narration, no VO script.
- Thesis/demo-appropriate polish level — avoid anything that reads as consumer-app gimmicky; this represents a real cooperative financial system.
- Integration risk flagged and accepted by the user: the module-tour act (15–25s) covers 5+ modules in ~10s — each gets its name + one hero visual, not a full walkthrough, to avoid feeling rushed or blowing the length cap.
- Prior related work: `TTMPC_THESIS/brag-output/` holds a separate, already-delivered 15–25s "brag" launch video for the same project (different workflow, different scope) — unrelated to this production, do not reuse its composition, only its brand-research findings (same real color/font tokens).
