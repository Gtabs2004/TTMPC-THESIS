import React, { useState } from 'react';

function Sign_In() {
  // State updated to use 'username'
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  const [status, setStatus] = useState({ loading: false, error: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: '' });

    try {
      const PYTHON_API_URL = 'http://localhost:8000/api/login'; 

      const response = await fetch(PYTHON_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      console.log('Login successful:', data);
      alert(`Welcome back, ${data.user.username}!`);
      
      // Redirect or save user data here
      // window.location.href = '/dashboard';

    } catch (err) {
      // If the error is an object (sometimes happens with fetch), stringify it
      const errorMessage = typeof err.message === 'object' ? JSON.stringify(err.message) : err.message;
      setStatus({ loading: false, error: errorMessage });
    } finally {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="bg-white flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <img
          src="src/assets/img/ttmpc logo.png"
          alt="Your Company"
          className="ml-32 my-auto h-30 w-auto"
        />
        <h2 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-green-700">
          Sign in to your account
        </h2>
      </div>

      <div className="h-80 w-20 bg-gray-100 p-12 mt-5 rounded-xl  shadow-md sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleSubmit}className="space-y-6 ">
          
          {/* USERNAME FIELD */}
          <div>
            <label htmlFor="username" className="block text-sm/6 font-medium text-black">
              Username
            </label>
            <div className="mt-2">
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
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
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                className="block w-full rounded-md bg-gray-400 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
              />
            </div>
          </div>

          {status.error && (
            <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
              {status.error}
            </div>
          )}

          {/* BUTTON */}
          <div>
            <button
              type="submit"
              disabled={status.loading}
              className={`flex w-full justify-center rounded-md bg-green-700 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-green-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 ${status.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {status.loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="mt-14 text-center text-sm/6 text-gray-400">
          Not a member?{' '}
          <a href="#" className="font-semibold text-green-700 ">
            Start a 14 day free trial
          </a>
        </p>
      </div>
    </div>
  );
}


export default Sign_In;