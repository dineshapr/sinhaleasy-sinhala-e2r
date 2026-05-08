import { useState } from "react";
import logo from "../assets/logo.png";

export default function Topbar({ currentPage, setPage }) {
  // Navigation items configuration
  const navItems = [
    { id: "home", label: "Home" },
    { id: "guidelines", label: "Guidelines" },
    { id: "help", label: "Help" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-zinc-900 text-white border-b border-zinc-800 sticky top-0 z-50">
      {/* Left Section: Logo and Brand */}
      <div
        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setPage("home")}
      >
        <img
          src={logo}
          alt="SINHALEASY"
          className="h-14 w-auto"
        />
        {/* <span className="font-bold tracking-tight text-lg hidden sm:block">
          SINHALEASY
        </span> */}
      </div>

      {/* Right Section: Navigation Links */}
      <div className="flex items-center gap-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 
              ${currentPage === item.id
                ? "bg-white text-black" // Active Style
                : "text-zinc-400 hover:text-white hover:bg-zinc-800" // Inactive/Hover Style
              }`}
          >
            {item.label}
          </button>
        ))}

        {/* Profile Avatar Placeholder (Optional extra) */}
        <div className="ml-4 h-8 w-8 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center cursor-pointer hover:border-zinc-400">
          <span className="text-xs font-bold">U</span>
        </div>
      </div>
    </nav>
  );
}