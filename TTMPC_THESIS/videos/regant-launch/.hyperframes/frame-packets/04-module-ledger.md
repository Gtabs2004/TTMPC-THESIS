# Frame packet: 04-module-ledger

## Project inputs

- Project: C:\Users\Nash Ervine\OneDrive\Documents\GitHub\TTMPC-THESIS\TTMPC_THESIS\videos\regant-launch
- Design tokens: C:\Users\Nash Ervine\OneDrive\Documents\GitHub\TTMPC-THESIS\TTMPC_THESIS\videos\regant-launch\frame.md
- RULES_DIR: C:\Users\Nash Ervine\.claude\skills\hyperframes-animation\rules

## Assigned storyboard block

## Frame 4 — Module: Loan Ledger

- scene: Payment-history ledger — date, reference, paid, penalty, remaining balance, status chips
- voiceover:
- sfx: whoosh-short
- duration: 2s
- transition_in: push-slide LEFT
- status: built
- src: compositions/frames/04-module-ledger.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: confidence
- asset_candidates: source:src/Bookkeeper/Components/Loan-Ledger.jsx — real loan-ledger payment-history table (no-capture path)

Source: `src/Bookkeeper/Components/Loan-Ledger.jsx`. Real column set and color logic: validated=green, partial=amber, rejected=red, upcoming=blue; penalty column highlights red only when non-zero. `push-slide LEFT` — the lateral "next card" feel for this run of module beats.

narrativeRole: proves financial tracking is precise, not manual.
keyMessage: every payment, penalty, and balance — tracked to the peso.
