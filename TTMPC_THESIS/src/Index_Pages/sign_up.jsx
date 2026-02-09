import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';

const Sign_Up = () => {
  // 1. Logic from your reference
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signUpNewUser } = UserAuth();
  const navigate = useNavigate();

    const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signUpNewUser(email, password); // Call context function

      if (result.success) {
        navigate("/dashboard"); // Navigate to dashboard on success
      } else {
        setError(result.error.message); // Show error message on failure
      }
    } catch (err) {
      setError("An unexpected error occurred."); // Catch unexpected errors
    } finally {
      setLoading(false); // End loading state
    }
  };

  return (
    <div className="bg-white flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      {/* Header & Logo */}
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img
          src="src/assets/img/ttmpc logo.png"
          alt="Your Company"
          className="ml-32 my-auto h-30 w-auto"
        />
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-green-700">
          Create your account
        </h2>
      </div>

      {/* FORM CONTAINER: Fixed 'w-20' to 'w-full' so it is visible */}
      <div className="w-full bg-gray-100 p-12 mt-5 rounded-xl shadow-md sm:mx-auto sm:max-w-sm">
        <form onSubmit={handleSignUp} className="space-y-6">
          
          {/* EMAIL FIELD */}
          <div>
            <label htmlFor="email" className="block text-sm/6 font-medium text-black">
              Email
            </label>
            <div className="mt-2">
              <input
                placeholder="Email"
                type="email"
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md bg-gray-400 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
              />
            </div>
          </div>

          {/* PASSWORD FIELD */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm/6 font-medium text-black">
                Password
              </label>
            </div>
            <div className="mt-2">
              <input
                placeholder="Password"
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md bg-gray-400 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
              />
            </div>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
              {error}
            </div>
          )}

          {/* BUTTON */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className={`flex w-full justify-center rounded-md bg-green-700 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-green-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Creating account...' : 'Sign up'}
            </button>
          </div>
        </form>

        <p className="mt-14 text-center text-sm/6 text-gray-400">
          Already a member?{' '}
          {/* Using Link for router navigation */}
          <Link to="/" className="font-semibold text-green-700 hover:text-green-600">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Sign_Up;