---
target: General Assembly UX
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Nash Ervine\\Documents\\GitHub\\TTMPC-THESIS\\TTMPC_THESIS\\src\\secretary\\Secretary_General_Assembly.jsx"
target_fingerprint: "sha256:715ad0a40dd1814f1a06900e881d3f18354793f106330d40ac8821a2daf08afe"
target_path: "C:\\Users\\Nash Ervine\\Documents\\GitHub\\TTMPC-THESIS\\TTMPC_THESIS\\src\\secretary\\Secretary_General_Assembly.jsx"
timestamp: 2026-10-24T10-51-01Z
slug: secretary-secretary-general-assembly-jsx-3c67e479
---
# General Assembly Attendance UX Review

## Run Notes

- Target: `TTMPC_THESIS/src/secretary/Secretary_General_Assembly.jsx`
- Mode: Operate
- Method: Direct source review plus live browser review at `/Secretary_General_Assembly`; the visible roster showed 302 total, 285 present, and 17 absent. Browser view was approximately 1013x600. The idle-session dialog initially blocked the page, then was dismissed to inspect it.
- Delegation: Single-context review; the scope and evidence fit a direct read, so no assessment agents were used.
- Detector: `impeccable detect --json` returned no static findings. The injected live detector loaded and reported 11 anti-pattern hits, but did not expose individually readable rules; no specific issue below is attributed to those hits.
- No application code was changed.

## Design Specificity

The page is credible and consistent with REGANT's Cooperative Ledger system: slate canvas, white KPI/table surfaces, cooperative green, explicit attendance states, and task-specific language. It feels appropriate to a cooperative Secretary workflow, though its composition remains conventional rather than uniquely bespoke.

## Nielsen Heuristics

| # | Heuristic | Score | Evidence |
|---|---|---:|---|
| 1 | Visibility of system status | 3/4 | Loading, empty, saving, unsaved, and success/error states exist; bulk and individual save semantics are not consistent. |
| 2 | Match between system and real world | 3/4 | Present/Absent and member terms are clear; “MIGS” in the helper copy is unexplained. |
| 3 | User control and freedom | 2/4 | Search and filters are easy to change, but there is no undo and bulk save can clear unrelated drafts. |
| 4 | Consistency and standards | 2/4 | Individual edits wait for Save, while bulk status changes commit immediately. |
| 5 | Error prevention | 2/4 | A confirmation protects bulk changes, but only three selected names are previewed and draft-loss is not guarded. |
| 6 | Recognition rather than recall | 3/4 | Counts, labels, tabs, and per-row controls are visible and named. |
| 7 | Flexibility and efficiency of use | 3/4 | Search, status filters, pagination, export, and bulk marking support efficient work; keyboard accelerators are absent. |
| 8 | Aesthetic and minimalist design | 2/4 | Visual hierarchy is coherent, but repeated counts and tall KPI cards push the roster down. |
| 9 | Error recovery | 3/4 | Save errors are surfaced and normal failed saves preserve drafts; the bulk-success refetch clears drafts. |
| 10 | Help and documentation | 1/4 | The helper sentence gives context, but there is no contextual help for bulk selection or MIGS. |

**Total: 24/40 — Acceptable.**

## Cognitive Load

**3 of 8 checklist failures — moderate load.** The roster is the primary work surface but sits below a tall KPI block; individual draft editing and immediate bulk saving require users to remember two different commit models; count information is repeated in KPI cards and status tabs. Grouping, visible labels, and progressive disclosure for bulk/export controls are strengths. No decision point exposes more than four options at once.

## Strengths

- The Cooperative Ledger palette and shared KPI cards make the page feel native to the staff portal.
- Attendance status is explicit, searchable/filterable, and represented with both labels and semantic color.
- Loading, empty, unsaved, save feedback, pagination, and report-export paths are present.

## Priority Issues

1. **[P1] Bulk marking can lose unsaved edits.** `handleConfirmBulkMark` sends selected members using the persisted `row.remarks`, then refetches the roster; `fetchRoster` clears all `edits`. This can discard pending edits for unselected members and replace a selected member's unsaved remark with its old value. **Fix:** block bulk commit while drafts exist and offer Save/Discard, or merge pending edits into one consistent atomic save. Suggested command: `/impeccable harden`.
2. **[P2] Bulk selection scope is easy to misread.** “Select all filtered members” spans every page, selections survive filter changes, and the confirmation only names the first three people before collapsing the rest to “+ N more.” A user can commit to people no longer visible in the current filter. **Fix:** make the cross-page/filter scope explicit, show a reviewable full selection list, and clear or reconcile selection when filters change. Suggested command: `/impeccable clarify`.
3. **[P2] The roster is below the fold in the observed viewport.** At about 1013x600, the 3-card KPI layout wraps to two cards plus one, while the same counts are repeated in the filter tabs; the attendance table is pushed below the initial view. **Fix:** preserve shared card styling but reduce KPI height/repetition or use a compact summary so row work starts sooner. Suggested command: `/impeccable layout`.
4. **[P2] The table forces horizontal scrolling below 1080px.** Its fixed `min-w-[1080px]` includes six columns, including editable status and remarks. Staff device context is not fixed, so tablet use would require sideways scrolling to complete routine edits. **Fix:** test narrow widths and adapt row details into a responsive layout or prioritize the key columns with progressive disclosure. Suggested command: `/impeccable adapt`.

## Persona Red Flags

- **Alex (Power User):** The 302-member roster is paginated 10 at a time. Bulk selection helps, but the confirmation hides all but three names and bulk actions do not share the Save/draft workflow. This makes the fast path riskier than it appears.
- **Sam (Accessibility-Dependent User):** Row status and member selection are labeled, but the bulk-status selector has no accessible name. The export popup is declared as a dialog without focus movement/management, which can make keyboard and screen-reader navigation confusing.

## Minor Observations

- “2026 Annual Meeting” is shown in the page header while the exact date (March 21, 2026) is shown separately in the toolbar; one full-date context would be easier to scan.
- The blank-search result message does not offer a direct clear-filter action, though the status tabs and search field remain available.

## Questions to Consider

- Should bulk marking be disabled until individual drafts are saved, or should it commit all pending edits together?
- Is the primary Secretary workstation expected to be desktop-only, or should the 1080px-wide editable table be treated as a tablet workflow too?
