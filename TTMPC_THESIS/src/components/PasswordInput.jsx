import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const PasswordInput = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete = 'current-password',
  required = false,
  minLength,
  disabled = false,
  className = '',
  wrapperClassName = '',
  toggleClassName = 'text-gray-400 hover:text-gray-600',
  leftIcon: LeftIcon,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative rounded-md shadow-sm ${wrapperClassName}`.trim()}>
      {LeftIcon ? (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <LeftIcon className="h-5 w-5 text-gray-400" />
        </div>
      ) : null}
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        disabled={disabled}
        className={className}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((prev) => !prev)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className={`absolute inset-y-0 right-0 pr-3 flex items-center transition-colors disabled:cursor-not-allowed ${toggleClassName}`}
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
};

export default PasswordInput;
