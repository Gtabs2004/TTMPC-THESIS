# Frame packet: 07-module-audit

## Project inputs

- Project: C:\Users\Nash Ervine\OneDrive\Documents\GitHub\TTMPC-THESIS\TTMPC_THESIS\videos\regant-launch
- Design tokens: C:\Users\Nash Ervine\OneDrive\Documents\GitHub\TTMPC-THESIS\TTMPC_THESIS\videos\regant-launch\frame.md
- RULES_DIR: C:\Users\Nash Ervine\.claude\skills\hyperframes-animation\rules

## Assigned storyboard block

## Frame 7 — Module: Audit Log

- scene: Audit trail — date/time, performed by, role, transaction type, action, reference, status
- voiceover:
- duration: 2s
- transition_in: push-slide LEFT
- status: built
- src: compositions/frames/07-module-audit.html
- type: feature_showcase
- persuasion: Risk reversal
- beat: confidence -> trust
- asset_candidates: source:src/components/AuditLogViewer.jsx — real shared audit-log table component (no-capture path)

Source: `src/components/AuditLogViewer.jsx` (shared by every portal's Audit Log page). Real column set: Date & Time, Performed By, Role, Transaction Type, Action, Reference/Record, Status. Closes the module cascade on the system's accountability story. `push-slide LEFT` continues the cascade; Frame 8 breaks it with `zoom-through` (new section).

narrativeRole: closes the module cascade on trust — every action is logged.
keyMessage: nothing happens off the record.
