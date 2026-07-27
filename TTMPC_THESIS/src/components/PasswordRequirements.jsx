import React from 'react';
import { Check, X } from 'lucide-react';
import { getPasswordRuleResults } from '../utils/passwordValidation';

const PasswordRequirements = ({ password = '', className = '' }) => {
  const results = getPasswordRuleResults(password);

  return (
    <div className={`mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 ${className}`.trim()}>
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Password Requirements</p>
      <ul className="space-y-1">
        {results.map((rule) => (
          <li
            key={rule.key}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              rule.met ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {rule.met ? (
              <Check className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordRequirements;
