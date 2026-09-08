// Staff-side reprint of the original loan application form.
//
// The member portal (LOANFORMS/*.jsx) can print because it already holds the
// full form state in memory. Staff reviewing a submitted loan only have the
// loan row + raw_payload, which intentionally does NOT carry the borrower's
// personal data. This module rebuilds the same LoanPdfRequest payload the
// member sends by re-reading the borrower's PDS, then hits the same
// /api/loans/{kind}/print-pdf endpoints so the printed form is identical.

import { supabase } from '../supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// Mirrors LoanPdfRequest in server/main.py. Anything outside this list is
// dropped so unrelated review state can't break server-side validation.
const PDF_PAYLOAD_FIELDS = [
  'application_type', 'control_no', 'date_applied',
  'surname', 'first_name', 'middle_name',
  'contact_no', 'latest_net_pay', 'share_capital', 'residence_address',
  'date_of_birth', 'age', 'civil_status', 'gender',
  'tin_no', 'gsis_sss_no', 'employer_name', 'office_address',
  'spouse_name', 'spouse_occupation',
  'loan_amount_words', 'loan_amount_numeric',
  'loan_purpose', 'loan_purpose_other',
  'loan_term_months', 'monthly_amortization',
  'source_of_income', 'user_email',
  'borrower_id_type', 'borrower_id_number',
  'bonus_amount_words', 'bonus_amount_numeric',
];

export const numberToWords = (num) => {
  if (num === '' || num === undefined || num === null) return '';

  num = parseInt(num, 10);
  if (Number.isNaN(num)) return '';

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion', 'trillion'];

  const convertHundreds = (n) => {
    let result = '';
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)];
      if (n % 10 > 0) result += ' ' + ones[n % 10];
    } else if (n >= 10) {
      result += teens[n - 10];
    } else if (n > 0) {
      result += ones[n];
    }
    return result.trim();
  };

  if (num === 0) return 'zero';

  let words = '';
  let scaleIndex = 0;

  while (num > 0) {
    if (num % 1000 !== 0) {
      words = convertHundreds(num % 1000) + ' ' + scales[scaleIndex] + ' ' + words;
    }
    num = Math.floor(num / 1000);
    scaleIndex++;
  }

  return words.trim().replace(/\s+/g, ' ');
};

// Which backend template a loan type maps to. Anything that isn't emergency or
// bonus falls back to the consolidated template (matches the member portal,
// where Consolidated_Up also posts to the consolidated endpoint).
export const resolvePrintKind = (loanTypeName) => {
  const raw = String(loanTypeName || '').toLowerCase();
  if (raw.includes('emergency')) return 'emergency';
  if (raw.includes('bonus')) return 'bonus';
  return 'consolidated';
};

const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

const firstValue = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && String(candidate).trim() !== '') {
      return candidate;
    }
  }
  return '';
};

// Staff equivalent of fetchLoanPrefill()'s profile resolution. That helper is
// bound to the logged-in member's own session, so it can't be reused here.
async function fetchBorrowerProfile({ memberId, membershipId, email }) {
  const profile = {};

  const merge = (row) => {
    if (!row) return;
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        profile[key] = value;
      }
    }
  };

  let resolvedMembershipId = membershipId || null;

  if (memberId) {
    const { data: memberRow } = await supabase
      .from('member')
      .select('membership_id, first_name, last_name, middle_initial')
      .eq('id', memberId)
      .limit(1)
      .maybeSingle();
    if (memberRow) {
      resolvedMembershipId = resolvedMembershipId || memberRow.membership_id || null;
      merge({
        surname: memberRow.last_name,
        first_name: memberRow.first_name,
        middle_name: memberRow.middle_initial,
      });
    }
  }

  if (resolvedMembershipId) {
    const { data: pdsRow } = await supabase
      .from('personal_data_sheet')
      .select('*')
      .eq('membership_number_id', resolvedMembershipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    merge(pdsRow);

    const { data: appRow } = await supabase
      .from('member_applications')
      .select('*')
      .eq('membership_id', resolvedMembershipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    merge(appRow);
  }

  if (email) {
    const { data: pdsByEmail } = await supabase
      .from('personal_data_sheet')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    merge(pdsByEmail);
  }

  // Authoritative share capital, same source the member form uses.
  if (memberId) {
    const { data: cbuRows } = await supabase
      .from('capital_build_up')
      .select('*')
      .eq('member_id', memberId)
      .limit(200);

    if (Array.isArray(cbuRows) && cbuRows.length) {
      const latestRow = [...cbuRows].sort((a, b) => {
        const aTs = Date.parse(a?.transaction_date || 0) || 0;
        const bTs = Date.parse(b?.transaction_date || 0) || 0;
        return bTs - aTs;
      })[0];

      const shareCapital = firstValue(
        latestRow?.ending_share_capital,
        (latestRow?.starting_share_capital != null && latestRow?.capital_added != null)
          ? Number(latestRow.starting_share_capital) + Number(latestRow.capital_added)
          : null,
        latestRow?.share_capital_amount,
        latestRow?.share_capital,
        latestRow?.amount
      );
      if (shareCapital !== '') profile.share_capital = shareCapital;
    }
  }

  return profile;
}

// The review form stores a co-maker's ID as a single string, prefixed with the
// document type when it was auto-filled from a member's TIN (e.g. "TIN-123-...").
// The printed oath has separate "Valid ID" and "ID Number" lines, so split it.
const splitCoMakerId = (rawId) => {
  const value = String(rawId || '').trim();
  if (!value) return { id_type: '', id_no: '' };

  const match = value.match(/^([A-Za-z][A-Za-z ./]*?)\s*[-:]\s*(.+)$/);
  if (match) {
    return { id_type: match[1].trim(), id_no: match[2].trim() };
  }
  return { id_type: '', id_no: value };
};

// Keeps only rows a reviewer actually filled in, so a half-empty second slot
// doesn't stamp blank lines onto the form.
const normalizeCoMakersForPrint = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .slice(0, 2)
    .map((row) => {
      const { id_type, id_no } = splitCoMakerId(row?.id_no);
      return {
        name: String(row?.name || '').trim(),
        id_type,
        id_no,
        address: String(row?.address || '').trim(),
        email: String(row?.email || '').trim(),
        mobile: String(row?.mobile || row?.contact_no || '').trim(),
      };
    })
    .filter((row) => row.name || row.id_no || row.address || row.email || row.mobile);
};

/**
 * Rebuild the member-side print payload for a submitted loan.
 *
 * @param {object} loan       the mapped loanDetails object from LoanApprovalDetails
 * @param {Array}  coMakers   optional live co-maker rows from the review form
 * @returns {Promise<object>} payload matching LoanPdfRequest
 */
export async function buildStaffPrintPayload(loan, coMakers = null) {
  const raw = loan?.rawPayload || {};
  const optional = raw.optionalFields || {};

  const isKoica = loan?.sourceTable === 'koica_loans';
  const profile = isKoica
    ? {}
    : await fetchBorrowerProfile({
        memberId: loan?.borrowerMemberId,
        membershipId: raw.membership_number_id || optional.membership_number_id,
        email: loan?.summary?.memberEmail,
      });

  // KOICA applications carry the borrower's details in raw_payload directly.
  const koicaBorrower = isKoica ? { ...raw, ...optional } : {};

  const amount = firstValue(
    loan?.summary?.recommendedAmountRaw,
    raw.loan_amount,
    optional.loan_amount
  );
  const amountWords = firstValue(
    optional.loan_amount_words,
    raw.loan_amount_words,
    (() => {
      const words = numberToWords(amount);
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
    })()
  );

  const tin = firstValue(
    profile.tin_number, profile.tin_no,
    koicaBorrower.tin_no, koicaBorrower.tin_number
  );

  const values = {
    application_type: firstValue(raw.application_type, optional.application_type, 'New'),
    control_no: loan?.id,
    date_applied: toDateInput(firstValue(raw.application_date, optional.application_date, loan?.applicationDate)),

    surname: firstValue(profile.surname, profile.last_name, koicaBorrower.borrower_surname, koicaBorrower.surname),
    first_name: firstValue(profile.first_name, koicaBorrower.borrower_first_name, koicaBorrower.first_name),
    middle_name: firstValue(profile.middle_name, profile.middle_initial, koicaBorrower.middle_name),

    contact_no: firstValue(profile.contact_number, profile.contact_no, koicaBorrower.contact_no),
    latest_net_pay: firstValue(optional.latest_net_pay, profile.latest_net_pay, profile.salary, profile.annual_income),
    share_capital: firstValue(optional.share_capital, profile.share_capital),
    residence_address: firstValue(profile.permanent_address, profile.residence_address, koicaBorrower.address),

    date_of_birth: toDateInput(firstValue(profile.date_of_birth, koicaBorrower.date_of_birth)),
    age: firstValue(profile.age, koicaBorrower.age),
    civil_status: firstValue(profile.civil_status, koicaBorrower.civil_status),
    gender: firstValue(profile.gender, koicaBorrower.gender),

    tin_no: tin,
    gsis_sss_no: firstValue(profile.gsis_number, profile.gsis_sss_no, koicaBorrower.gsis_sss_no),
    employer_name: firstValue(profile.employer_name, koicaBorrower.employer_name),
    office_address: firstValue(profile.office_address, koicaBorrower.office_address),

    spouse_name: firstValue(profile.spouse_name, koicaBorrower.spouse_name),
    spouse_occupation: firstValue(profile.spouse_occupation, koicaBorrower.spouse_occupation),

    loan_amount_words: amountWords,
    loan_amount_numeric: amount,

    loan_purpose: firstValue(loan?.summary?.loanPurpose, optional.loan_purpose, raw.loan_purpose),
    loan_purpose_other: firstValue(optional.loan_purpose_other, raw.loan_purpose_other),

    loan_term_months: firstValue(loan?.computation?.termMonths, raw.term, optional.term),
    monthly_amortization: firstValue(optional.monthly_amortization, raw.monthly_amortization),

    source_of_income: firstValue(loan?.summary?.employerPosition, optional.source_of_income, profile.source_of_income),
    user_email: firstValue(loan?.summary?.memberEmail, profile.email),

    borrower_id_type: firstValue(optional.borrower_id_type, raw.borrower_id_type, tin),
    borrower_id_number: firstValue(optional.borrower_id_number, raw.borrower_id_number, tin),

    bonus_amount_words: firstValue(optional.bonus_amount_words, raw.bonus_amount_words),
    bonus_amount_numeric: firstValue(optional.bonus_amount_numeric, raw.bonus_amount_numeric),
  };

  const payload = {};
  PDF_PAYLOAD_FIELDS.forEach((key) => {
    const value = values[key];
    payload[key] = value === null || value === undefined ? '' : String(value);
  });

  // Co-Makers' Oath. Prefer the rows currently on screen (so an in-progress
  // edit prints), falling back to what the bookkeeper already saved.
  const sourceCoMakers = Array.isArray(coMakers) && coMakers.length
    ? coMakers
    : (loan?.summary?.bookkeeperCoMakers || []);
  payload.co_makers = normalizeCoMakersForPrint(sourceCoMakers);

  return payload;
}

/**
 * Generate and open the printable application form for a submitted loan.
 * Mirrors handlePrintPdf() in the member LOANFORMS components.
 *
 * @param {object} loan      the mapped loanDetails object from LoanApprovalDetails
 * @param {Array}  coMakers  optional live co-maker rows from the review form
 */
export async function printLoanApplicationForm(loan, coMakers = null) {
  const kind = resolvePrintKind(loan?.summary?.loanType);
  const payload = await buildStaffPrintPayload(loan, coMakers);

  const response = await fetch(`${API_BASE_URL}/api/loans/${kind}/print-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Try JSON first (FastAPI HTTPException), then fall back to plain text so
    // the reviewer sees the real reason instead of a generic message.
    const contentType = response.headers.get('content-type') || '';
    let detail = '';
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((e) => `${(e.loc || []).join('.')}: ${e.msg || e.type}`)
          .join(' • ');
      } else {
        detail = body?.detail || body?.message || '';
      }
    } else {
      detail = await response.text().catch(() => '');
    }
    throw new Error(detail || `HTTP ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error('Server returned an empty PDF.');
  }

  const objectUrl = URL.createObjectURL(blob);
  const filename = `${kind.toUpperCase()}_LOAN_${loan?.id || 'FORM'}.pdf`;
  const previewWindow = window.open(objectUrl, `loan-print-${loan?.id || kind}`);

  if (!previewWindow) {
    // Popup was blocked - fall back to direct download so the action isn't lost.
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    previewWindow.focus();
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
