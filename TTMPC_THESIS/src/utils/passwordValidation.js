export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (pwd) => pwd.length >= 8 },
  { key: 'uppercase', label: 'At least one uppercase letter (A–Z)', test: (pwd) => /[A-Z]/.test(pwd) },
  { key: 'lowercase', label: 'At least one lowercase letter (a–z)', test: (pwd) => /[a-z]/.test(pwd) },
  { key: 'number', label: 'At least one number (0–9)', test: (pwd) => /[0-9]/.test(pwd) },
];

export const getPasswordRuleResults = (password = '') =>
  PASSWORD_RULES.map((rule) => ({ key: rule.key, label: rule.label, met: rule.test(password) }));

export const isPasswordStrong = (password = '') =>
  PASSWORD_RULES.every((rule) => rule.test(password));

export const getPasswordRequirementError = (password = '') => {
  const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failedRule ? `Password must include ${failedRule.label.toLowerCase()}.` : '';
};
