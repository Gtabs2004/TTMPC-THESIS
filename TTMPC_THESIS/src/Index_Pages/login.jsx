import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Mail, Lock, User } from 'lucide-react';

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
    if (normalizedRole === 'secretary') return '/BOD-dashboard';
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
      }
    } else {
      setError(result.error || 'Login failed. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      
      {/* Header & Logo */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <img
          src="src/assets/img/ttmpc logo.png"
          alt="TTMPC Logo"
          className="mx-auto h-24 w-auto drop-shadow-sm mb-6"
        />
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Welcome Back
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Please log in to your account to continue
        </p>
      </div>

      {/* Form Container */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-6 shadow-lg sm:rounded-2xl sm:px-10 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* ROLE FIELD */}
            <div>
              <label htmlFor="role" className="block text-sm font-semibold text-gray-700">
                Select Your Role
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <select
                  id="role"
                  name="role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-sm transition-colors bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400 appearance-none"
                >
                  <option value="">-- Choose a role --</option>
                  <option value="bookkeeper">Bookkeeper</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="secretary">Secretary</option>
                  <option value="bod">BOD</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
            
            {/* EMAIL FIELD */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700">
                Email Address
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-sm transition-colors bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>

            {/* PASSWORD FIELD */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-[#66B538] hover:text-green-700 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-sm transition-colors bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200 flex items-start">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            )}

            {/* BUTTON */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-[#66B538] hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#66B538] transition-all duration-200 ${
                  loading ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                {loading ? 'Logging in...' : 'Log in'}
              </button>
            </div>
          </form>

          {/* SIGN UP LINK */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/sign_up" className="font-bold text-[#66B538] hover:text-green-700 transition-colors">
                Sign up here
              </Link>
            </p>
          </div>
        </div>
      </div>
      
    </div>
  );
}

export default Login;