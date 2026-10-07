import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Mail, Lock } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import AuthLayout, { AuthError, AuthSubmitButton } from '../components/AuthLayout';
import { authInputClass, authLabelClass, friendlyAuthError } from '../components/authForm';

function MemberLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signInUser } = UserAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signInUser(email, password);

    if (result.success) {
      navigate('/member-dashboard');
      return;
    } else {
      setError(friendlyAuthError(result.error));
    }

    setLoading(false);
  };

  const describedBy = error ? 'auth-error' : undefined;

  return (
    <AuthLayout title="Welcome back!" subtitle="Sign in to access your TTMPC member account.">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* EMAIL FIELD */}
        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email Address
          </label>
          <div className="relative mt-1.5">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Mail className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={loading}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass}
            />
          </div>
        </div>

        {/* PASSWORD FIELD */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={authLabelClass}>
              Password
            </label>
            <Link
              to="/forgot-password"
              className="rounded text-sm font-medium text-[#3A7D1C] underline-offset-2 hover:text-[#2F6616] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#66B538]"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            disabled={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={Lock}
            wrapperClassName="mt-1.5 shadow-none"
            toggleTabIndex={0}
            toggleClassName="text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:text-[#3A7D1C]"
            className={`${authInputClass} pr-10`}
          />
        </div>

        <AuthError message={error} />

        <AuthSubmitButton loading={loading}>Sign In</AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}

export default MemberLogin;
