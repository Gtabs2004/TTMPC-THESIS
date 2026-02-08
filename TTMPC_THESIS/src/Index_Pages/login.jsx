import React from 'react'

 function Login() {
  return (
    <>
    <div className="bg-[#E9F7DE] w-full h-20 flex items-center justify-between px-6">
      <img src="src/assets/img/ttmpc logo.png" alt="Your Company" className="ml-12  p-2 h-16 w-auto" />
      <nav>
        <ul className="flex gap-8 items-center text-sm font-medium mr-4 cursor-pointer">
          <li>Home</li>
          <li>About Us</li>
          <li>Products</li>
          <li>FAQs</li>
          <li>Contact Us</li>
          <li>
            <button className="border-green-400 text-green-400 py-2 border rounded p-2">Be a Member</button>
          </li>
        </ul>
      </nav>
    </div>

    <form className=" mt-16 h-4/6 w-25 bg-white p-6 rounded-xl  shadow-md sm:mx-auto sm:w-full sm:max-w-sm">
    <img src="src/assets/img/ttmpc logo.png" alt="Your Company" className="block mx-auto h-32 w-auto" />
    <h2 className="text-center font-semibold text-xl">Login to your Account</h2>
    <p className="text-center text-xs">Enter your details to login your account</p>

        <label htmlFor="username"  className="block text-sm font-medium text-gray-700 ">
  
        </label>
        <input
          id="username"
          name="username"
          type="text"
          placeholder ="Username"
          autoComplete="username"
          required
          className=" border border-black block w-full rounded-md  shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 mt-1"
        />
        <label htmlFor="password"  className="block text-sm font-medium text-gray-700 mt-4">
          
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder ="Password"
          autoComplete="current-password"
          required
          className="border border-black block w-full rounded-md  shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 mt-1"
        />
        <span className="text-xs text-green-400 mt-2 block float-right mb-4">Forgot Password?</span>

        <label htmlFor="role" className="block text-sm font-medium text-gray-700 mt-4">
      
        </label>  
        <select
          id="role"
          name="role"
          placeholder ="Role"
          required
          className="border border-black block w-full rounded-md  shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 mt-1">
          <option value="">Select Role</option>
          <option value="admin">Bookkeepr</option>
          <option value="user">User</option>
        </select>
        <button>Back</button>
        <button>Login</button>
    </form>
    </>
  )
}
export default Login;

