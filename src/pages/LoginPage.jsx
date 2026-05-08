import { useState } from "react";
import logo from "../assets/logo.png";
export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e) => {
    // Prevent default form submission if using a form tag
    if (!username.trim() || !password.trim()) return;

    // Passing both credentials back to the parent handler
    onLogin({ username, password });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-black text-white font-sans">
      <div className="bg-zinc-900 p-8 rounded-2xl shadow-2xl w-96 flex flex-col items-center">

        {/* Logo Section */}
        <div className="mb-6">
          <img
            src={logo}  // Use the imported logo here
            alt="SINHALEASY Logo"
            className="h-14 w-auto object-contain"
          />
        </div>

        {/* <h1 className="text-2xl font-bold mb-6 text-center">Login to SINHALEASY</h1> */}

        <div className="w-full space-y-4">
          {/* Username Input */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1 ml-1">Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1 ml-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-white text-black font-semibold py-3 mt-4 rounded-lg hover:bg-gray-200 active:scale-[0.98] transition-transform"
          >
            Continue
          </button>
        </div>

        <p className="mt-6 text-xs text-zinc-500 text-center">
          Easy to read adaptation for Sinhala language.
        </p>
      </div>
    </div>
  );
}