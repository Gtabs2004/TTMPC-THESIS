# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Membership Training Policy (Updated)

- Membership approval now requires one completed training only.
- The operational training stage is `1st Training`.
- Applicants marked `Present` in `1st Training` are eligible for final membership approval.

### Updated Modules

- BOD approval flow: `src/BOD/Components/MemberApprovalDetails.jsx`
- BOD approvals dashboard/tabs: `src/BOD/Components/Member-Approvals.jsx`
- Secretary attendance recording: `src/BOD/Components/Secretary_Attendance.jsx`
- Backend confirmation eligibility: `src/server/applicationConfirmation.py`

### SQL Migration

- Apply `src/server/one_training_policy_update.sql` in Supabase SQL editor to normalize old 2nd-training statuses and enforce one-training stage labels.
