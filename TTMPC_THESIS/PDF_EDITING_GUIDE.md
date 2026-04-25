# Consolidated PDF Editing Guide

This guide is only for the consolidated loan PDF flow.

## What to install

### System requirements

- Python 3.11 or newer
- Node.js 20 or newer
- npm

### Backend Python packages

Install the backend dependencies from:

- `TTMPC_THESIS/src/server/requirements.txt`

Current PDF generation uses `pypdf` only. `reportlab` is not required.

### Frontend packages

Install the frontend dependencies from:

- `TTMPC_THESIS/package.json`

## Files to edit for PDF changes

- `TTMPC_THESIS/src/server/main.py` - backend PDF layout, coordinates, font sizes, and text wrapping
- `TTMPC_THESIS/src/LOANFORMS/Consolidated_Loan.jsx` - print button, request payload, and preview flow

## Commands

### Install backend dependencies

From `TTMPC_THESIS/src/server`:

```powershell
python -m pip install -r requirements.txt
```

### Install frontend dependencies

From `TTMPC_THESIS`:

```powershell
npm install
```

### Start the backend

From `TTMPC_THESIS/src/server`:

```powershell
python -m uvicorn main:app --reload
```

### Start the frontend

From `TTMPC_THESIS`:

```powershell
npm run dev
```

### Optional frontend checks

From `TTMPC_THESIS`:

```powershell
npm run lint
npm run build
```

## Quick PDF test

Use this after editing the PDF layout to confirm the backend still returns a generated PDF:

```powershell
$body = @{ application_type = 'New'; control_no = 'CL-20260425-1234'; date_applied = '2026-04-25'; surname = 'Test'; first_name = 'User'; middle_name = 'Q'; contact_no = '09123456789'; latest_net_pay = '30000'; share_capital = '5000'; residence_address = 'Test Address'; date_of_birth = '1990-01-01'; age = '36'; civil_status = 'Single'; gender = 'Male'; tin_no = '123-456-789-000'; gsis_sss_no = 'SSS-123'; employer_name = 'TTMPC'; office_address = 'Office'; spouse_name = ''; spouse_occupation = ''; loan_amount_words = 'Ten thousand'; loan_amount_numeric = '10000'; loan_purpose = 'Education'; loan_purpose_other = ''; loan_term_months = '12'; monthly_amortization = '1000'; source_of_income = 'Salary'; user_email = 'test@example.com'; borrower_id_type = 'TIN'; borrower_id_number = '123-456-789-000' } | ConvertTo-Json -Depth 5
Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:8000/api/loans/consolidated/print-pdf' -ContentType 'application/json' -Body $body
```

If the endpoint is healthy, it should return a PDF response instead of `500 Internal Server Error`.

## Notes

- Restart the backend after any change in `main.py`.
- The PDF layout is coordinate-based, so small font or position edits can affect alignment.
- If you only change the PDF overlay code, you usually do not need to rebuild the frontend unless the request payload or print button changes.