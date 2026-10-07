import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Mail, Lock, User, ChevronDown } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import AuthLayout, { AuthError, AuthSubmitButton } from '../components/AuthLayout';
import { authInputClass, authLabelClass, friendlyAuthError } from '../components/authForm';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signInUser } = UserAuth();
  const navigate = useNavigate();

  const getRoleRoute = (roleValue) => {
    const normalizedRole = (roleValue || '').toLowerCase();

    if (normalizedRole === 'manager') return '/manager-dashboard';
    if (normalizedRole === 'bod') return '/BOD-dashboard';
    if (normalizedRole === 'secretary') return '/Secretary_Attendance';
    if (normalizedRole === 'cashier') return '/Cashier_Dashboard';
    if (normalizedRole === 'treasurer') return '/Treasurer_Dashboard';
    return '/dashboard';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signInUser(email, password);

    if (result.success) {
      const accountRole = (result.role || '').toLowerCase();
      const selectedRole = role.toLowerCase();
      const allowedStaffRoles = ['bookkeeper', 'treasurer', 'manager', 'cashier', 'secretary', 'bod'];

      if (accountRole === 'member') {
        setError('This account is for the Member portal. Please use Member Login.');
      } else if (!allowedStaffRoles.includes(accountRole)) {
        setError('This role is not allowed in the Staff portal.');
      } else if (accountRole !== selectedRole) {
        setError('Selected role does not match your account role.');
      } else {
        navigate(getRoleRoute(result.role));
        return;
      }
    } else {
      setError(friendlyAuthError(result.error));
    }

    setLoading(false);
  };

  const describedBy = error ? 'auth-error' : undefined;

  return (
    <AuthLayout title="Welcome back!" subtitle="Sign in to access your TTMPC staff account.">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ROLE FIELD */}
        <div>
          <label htmlFor="role" className={authLabelClass}>
            Select Your Role
          </label>
          <div className="relative mt-1.5">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <User className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
            <select
              id="role"
              name="role"
              required
              disabled={loading}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={`${authInputClass} appearance-none pr-10 ${role ? '' : 'text-gray-500'}`}
            >
              <option value="">Choose a role</option>
              <option value="bod">BOD</option>
              <option value="secretary">Secretary</option>
              <option value="bookkeeper">Bookkeeper</option>
              <option value="treasurer">Treasurer</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ChevronDown className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
          </div>
        </div>

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
          <label htmlFor="password" className={authLabelClass}>
            Password
          </label>
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

export default Login;
