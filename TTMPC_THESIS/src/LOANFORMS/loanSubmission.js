import { supabase } from '../supabaseClient';

const ACCOUNT_TABLE_CANDIDATES = ['member_account', 'member_accounts'];
let activeAccountTables = null;

const toInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const toFloat = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const resolveInterestRate = (loanTypeCode, interestRate) => {
  const parsed = toFloat(interestRate);
  if (parsed !== null) return parsed;

  const code = String(loanTypeCode || '').trim().toUpperCase();
  if (code === 'CONSOLIDATED') return 0.083;
  if (code === 'EMERGENCY') return 2;
  if (code === 'BONUS') return 2;
  if (code === 'NONMEMBER_BONUS') return 2;
  return null;
};

export const createUniqueControlNumber = (prefix = 'LN') => {
  const safePrefix = String(prefix || 'LN').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'LN';
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${safePrefix}-${stamp}-${random}`;
};

const normalizeDateToIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeLoanStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return 'pending';

  const map = {
    pending: 'pending',
    'recommended for approval': 'recommended for approval',
    recommended_for_approval: 'recommended for approval',
    approved: 'approved',
    'to be disbursed': 'to be disbursed',
    to_be_disbursed: 'to be disbursed',
    rejected: 'rejected',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    released: 'released',
    disbursed: 'released',
  };

  return map[status] || 'pending';
};

const normalizeApplicationStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return 'pending';

  const map = {
    pending: 'pending',
    'recommended for approval': 'recommended for approval',
    recommended_for_approval: 'recommended for approval',
    approved: 'approved',
    'to be disbursed': 'to be disbursed',
    to_be_disbursed: 'to be disbursed',
    rejected: 'rejected',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    released: 'released',
    disbursed: 'released',
    new: 'pending',
    renewal: 'pending',
  };

  return map[status] || 'pending';
};

const normalizeApplicationType = (value) => {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'renewal') return 'renewal';
  return 'new';
};

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) {
    throw new Error('Please log in to submit a loan application.');
  }

  return user;
}

async function getCurrentUserIfAny() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user || null;
}

async function getMemberIdForUser(userId) {
  const { data, error } = await supabase
    .from('member')
    .select('id')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error('No member profile found for the logged-in account.');
  }

  return data.id;
}

async function getOptionalMemberIdForUser(userId) {
  const { data, error } = await supabase
    .from('member')
    .select('id')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function getLoanTypeId(loanTypeCode) {
  const code = String(loanTypeCode || '').trim().toUpperCase();
  if (!code) {
    throw new Error('Loan type is required.');
  }

  const tryQuery = async (builder) => {
    const { data, error } = await builder;
    if (error) return null;
    return data?.id || null;
  };

  // Try strict/code-based matching first when code column exists.
  let foundId = await tryQuery(
    supabase
      .from('loan_types')
      .select('id, code, name')
      .eq('code', code)
      .limit(1)
      .maybeSingle()
  );
  if (foundId) return foundId;

  foundId = await tryQuery(
    supabase
      .from('loan_types')
      .select('id, code, name')
      .ilike('code', code)
      .limit(1)
      .maybeSingle()
  );
  if (foundId) return foundId;

  // Name variants: supports both "Bonus" and "Bonus Loan" styles.
  const expectedNames = {
    CONSOLIDATED: ['Consolidated Loan', 'Consolidated'],
    BONUS: ['Bonus Loan', 'Bonus'],
    EMERGENCY: ['Emergency Loan', 'Emergency'],
    KOICA: ['KOICA Loan', 'Agri-Business Financial Facility Loan', 'ABFF Loan', 'KOICA'],
    NONMEMBER_BONUS: ['Nonmember Bonus Loan', 'Non-member Bonus Loan', 'Non Member Bonus Loan'],
  };

  const nameCandidates = expectedNames[code] || [code];
  for (const candidate of nameCandidates) {
    foundId = await tryQuery(
      supabase
        .from('loan_types')
        .select('id, name')
        .ilike('name', candidate)
        .limit(1)
        .maybeSingle()
    );
    if (foundId) return foundId;
  }

  // Last fallback: token match (e.g., name contains "bonus").
  const token = code.toLowerCase();
  foundId = await tryQuery(
    supabase
      .from('loan_types')
      .select('id, name')
      .ilike('name', `%${token}%`)
      .limit(1)
      .maybeSingle()
  );
  if (foundId) return foundId;

  throw new Error(
    `Loan type code not found: ${code}. Seed loan_types with Bonus, Consolidated, Emergency, KOICA, and Nonmember Bonus.`
  );
}

async function resolveCoMakerMemberId(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  const resolveFromMemberApplications = async () => {
    const { data: appRow, error: appError } = await supabase
      .from('member_applications')
      .select('membership_id')
      .ilike('email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appError || !appRow?.membership_id) {
      return null;
    }

    const { data: memberRow, error: memberError } = await supabase
      .from('member')
      .select('id')
      .eq('membership_id', appRow.membership_id)
      .limit(1)
      .maybeSingle();

    if (!memberError && memberRow?.id) {
      return memberRow.id;
    }

    return null;
  };

  if (!activeAccountTables) {
    const discovered = [];
    for (const tableName of ACCOUNT_TABLE_CANDIDATES) {
      const { error } = await supabase.from(tableName).select('user_id').limit(1);
      if (!error) {
        discovered.push(tableName);
      }
    }
    activeAccountTables = discovered;
  }

  for (const tableName of activeAccountTables) {
    const { data, error } = await supabase
      .from(tableName)
      .select('user_id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error || !data?.user_id) {
      continue;
    }

    const { data: memberRow, error: memberError } = await supabase
      .from('member')
      .select('id')
      .eq('id', data.user_id)
      .limit(1)
      .maybeSingle();

    if (!memberError && memberRow?.id) {
      return memberRow.id;
    }
  }

  return resolveFromMemberApplications();
}

export async function fetchLoanPrefill() {
  const user = await getCurrentUser();

  const toDateInput = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  };

  const normalizeProfile = (raw, memberRow) => {
    if (!raw && !memberRow) return null;
    const r = raw || {};
    const m = memberRow || {};

    return {
      member_id: m.id ?? null,
      surname: r.surname ?? r.last_name ?? m.last_name ?? null,
      first_name: r.first_name ?? m.first_name ?? null,
      middle_name: r.middle_name ?? r.middle_initial ?? m.middle_initial ?? null,
      contact_number: r.contact_number ?? r.contact_no ?? null,
      permanent_address: r.permanent_address ?? r.residence_address ?? null,
      date_of_birth: toDateInput(r.date_of_birth),
      age: r.age ?? null,
      civil_status: r.civil_status ?? null,
      gender: r.gender ?? null,
      tin_number: r.tin_number ?? r.tin_no ?? null,
      gsis_number: r.gsis_number ?? r.gsis_sss_no ?? null,
      gsis_sss_no: r.gsis_sss_no ?? r.gsis_number ?? null,
      source_of_income: r.income_source ?? r.source_of_income ?? r.occupation ?? null,
      employer_name: r.employer_name ?? null,
      office_address: r.office_address ?? null,
      spouse_name: r.spouse_name ?? null,
      spouse_occupation: r.spouse_occupation ?? null,
      salary: r.salary ?? null,
      annual_income: r.annual_income ?? null,
      latest_net_pay: r.latest_net_pay ?? r.salary ?? r.annual_income ?? null,
      share_capital: r.share_capital ?? null,
      share_capital_fallback: r.share_capital_fallback ?? null,
      membership_id: r.membership_id ?? m.membership_id ?? null,
      email: r.email ?? user.email,
    };
  };

  const mergeProfile = (base, incoming) => {
    if (!incoming) return base;
    if (!base) return incoming;
    const result = { ...base };
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = value;
      }
    }
    return result;
  };

  let memberRow = null;
  let profile = null;
  let latestShareCapital = null;
  let shareCapitalFallbackLabel = null;

  const { data: memberData, error: memberError } = await supabase
    .from('member')
    .select('id, membership_id, first_name, last_name, middle_initial')
    .eq('id', user.id)
    .limit(1)
    .maybeSingle();

  if (!memberError && memberData) {
    memberRow = memberData;
  }

  // Source 0: authoritative latest share capital from capital_build_up.
  if (memberRow?.id) {
    try {
      const { data: cbuRows, error: cbuError } = await supabase
        .from('capital_build_up')
        .select('*')
        .eq('member_id', memberRow.id)
        .limit(200);

      if (!cbuError && Array.isArray(cbuRows) && cbuRows.length) {
        const latestRow = [...cbuRows].sort((a, b) => {
          const aTs = Date.parse(a?.transaction_date || 0) || 0;
          const bTs = Date.parse(b?.transaction_date || 0) || 0;
          return bTs - aTs;
        })[0];

        latestShareCapital =
          latestRow?.ending_share_capital ??
          ((latestRow?.starting_share_capital ?? null) !== null && (latestRow?.capital_added ?? null) !== null
            ? Number(latestRow.starting_share_capital) + Number(latestRow.capital_added)
            : null) ??
          latestRow?.share_capital_amount ??
          latestRow?.share_capital ??
          latestRow?.amount ??
          null;
      } else if (cbuError) {
        console.warn('Loan prefill: unable to read capital_build_up (RLS or schema mismatch).', {
          member_id: memberRow.id,
          code: cbuError.code,
          message: cbuError.message,
        });
      }
    } catch (_err) {
      // Keep prefill resilient when CBU read fails.
    }
  }

  // Source 1: RPC prefill (may be partial)
  try {
    const { data, error } = await supabase.rpc('get_loan_prefill_by_member', {
      p_member_id: user.id,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        profile = mergeProfile(profile, normalizeProfile(row, memberRow));
      }
    }
  } catch (_err) {
    // fall through to table lookups
  }

  // Source 2: latest application by membership_id (always try, then merge)
  if (memberRow?.membership_id) {
    const { data: appByMembership, error: appMembershipError } = await supabase
      .from('member_applications')
      .select('*')
      .eq('membership_id', memberRow.membership_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!appMembershipError && appByMembership) {
      profile = mergeProfile(profile, normalizeProfile(appByMembership, memberRow));
    }
  }

  // Source 3: latest application by email (always try, then merge)
  {
    const { data: appByEmail, error: appByEmailError } = await supabase
      .from('member_applications')
      .select('*')
      .ilike('email', user.email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!appByEmailError && appByEmail) {
      profile = mergeProfile(profile, normalizeProfile(appByEmail, memberRow));
    }
  }

  // Source 4: member row only
  if (!profile && memberRow) {
    profile = normalizeProfile(null, memberRow);
    console.warn(
      'Loan prefill fallback: member_applications data not visible for this user. Check RLS SELECT policy on member_applications.',
      {
        auth_user_id: user.id,
        auth_email: user.email,
        membership_id: memberRow.membership_id,
      }
    );
  }

  // Force share capital from CBU when available, otherwise provide UI fallback label.
  if (latestShareCapital !== null && latestShareCapital !== undefined && latestShareCapital !== '') {
    profile = mergeProfile(profile, { share_capital: latestShareCapital });
  } else {
    shareCapitalFallbackLabel = 'N/A';
  }

  if (shareCapitalFallbackLabel) {
    profile = mergeProfile(profile, { share_capital_fallback: shareCapitalFallbackLabel });
  }

  return {
    userEmail: user.email,
    profile,
  };
}

export async function submitUnifiedLoan({
  loanTypeCode,
  controlNumber,
  applicationStatus,
  applicationType,
  applicationDate,
  loanAmount,
  principalAmount,
  interestRate,
  term,
  loanStatus = 'pending',
  disbursalDate = null,
  requireMemberProfile = true,
  targetTable = 'loans',
  applicantProfile = {},
  optionalFields = {},
  coMakers = [],
}) {
  const normalizedLoanStatus = normalizeLoanStatus(loanStatus);
  const normalizedApplicationStatus = normalizeApplicationStatus(applicationStatus);
  const normalizedApplicationType = normalizeApplicationType(applicationType ?? applicationStatus);

  if (targetTable !== 'loans') {
    const maybeUser = await getCurrentUserIfAny();
    const submittedEmail = String(optionalFields?.user_email || optionalFields?.email || maybeUser?.email || '').trim().toLowerCase() || null;

    const normalizedFullName = String(applicantProfile?.full_name || '').trim() || null;
    const credentialsPayload = applicantProfile?.credentials ?? null;

    const customPayload = {
      control_number: controlNumber,
      full_name: normalizedFullName,
      credentials: credentialsPayload,
      user_email: submittedEmail,
      loan_type_code: String(loanTypeCode || '').trim().toUpperCase() || null,
      loan_amount: toFloat(loanAmount),
      principal_amount: toFloat(principalAmount ?? loanAmount),
      interest_rate: resolveInterestRate(loanTypeCode, interestRate),
      term: toInt(term),
      loan_status: normalizedLoanStatus,
      application_status: normalizedApplicationStatus,
      application_type: normalizedApplicationType,
      application_date: normalizeDateToIso(applicationDate) ?? new Date().toISOString(),
      disbursal_date: normalizeDateToIso(disbursalDate),
      raw_payload: {
        optionalFields,
        coMakers,
      },
    };

    const { error: customInsertError } = await supabase.from(targetTable).insert([customPayload]);
    if (customInsertError) throw customInsertError;

    return {
      controlNumber,
      insertedCoMakers: 0,
    };
  }

  const user = await getCurrentUser();
  const memberId = requireMemberProfile
    ? await getMemberIdForUser(user.id)
    : await getOptionalMemberIdForUser(user.id);

  const coMakerRows = [];

  for (const coMaker of coMakers) {
    const normalizedEmail = String(coMaker?.email || '').trim().toLowerCase() || null;
    const memberIdForCoMaker = normalizedEmail ? await resolveCoMakerMemberId(normalizedEmail) : null;

    coMakerRows.push({
      loan_id: controlNumber,
      member_id: memberIdForCoMaker,
      liability_status: coMaker.liability_status || 'active',
      date_signed: normalizeDateToIso(coMaker.date_signed) ?? new Date().toISOString(),
      co_maker_name: coMaker.name || null,
      co_maker_email: normalizedEmail,
      co_maker_mobile: coMaker.mobile || coMaker.contact_no || null,
      co_maker_address: coMaker.address || null,
      co_maker_id_no: coMaker.id_no || null,
      is_member: Boolean(memberIdForCoMaker),
    });
  }

  const loanTypeId = await getLoanTypeId(loanTypeCode);

  const payload = {
    control_number: controlNumber,
    member_id: memberId,
    loan_type_id: loanTypeId,
    loan_amount: toFloat(loanAmount),
    principal_amount: toFloat(principalAmount ?? loanAmount),
    interest_rate: resolveInterestRate(loanTypeCode, interestRate),
    term: toInt(term),
    ...optionalFields,
    loan_status: normalizedLoanStatus,
    application_status: normalizedApplicationStatus,
    application_type: normalizedApplicationType,
    application_date: normalizeDateToIso(applicationDate) ?? new Date().toISOString(),
    disbursal_date: normalizeDateToIso(disbursalDate),
    user_email: user.email,
  };

  const { error: loanInsertError } = await supabase.from('loans').insert([payload]);
  if (loanInsertError) throw loanInsertError;

  if (coMakerRows.length) {
    const { error: coMakerError } = await supabase
      .from('co_makers')
      .insert(coMakerRows);

    if (coMakerError) throw coMakerError;
  }

  return {
    controlNumber,
    insertedCoMakers: coMakerRows.length,
  };
}
