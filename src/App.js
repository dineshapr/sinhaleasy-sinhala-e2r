// import { useState } from "react";
// import LoginPage from "./pages/LoginPage";
// import HomePage from "./pages/HomePage";
// import GuidelinesPage from "./pages/GuidelinesPage";
// import Topbar from "./components/Topbar";

// export default function App() {
//   const [user, setUser] = useState(null);
//   const [page, setPage] = useState("home");

//   if (!user) {
//     return <LoginPage onLogin={setUser} />;
//   }

//   return (
//     <div>
//       <Topbar setPage={setPage} />

//       {page === "home" && <HomePage />}
//       {page === "guidelines" && <GuidelinesPage />}
//     </div>
//   );
// }
import { useState, useEffect } from "react";
import Topbar from "./components/Topbar";
import HomePage from "./pages/HomePage";
import GuidelinesPage from "./pages/GuidelinesPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const [currentPage, setPage] = useState("home");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [user, setUser] = useState(null);
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const renderPage = () => {
    switch (currentPage) {
      case "home": return <HomePage />;
      case "guidelines": return <GuidelinesPage />;
      case "settings": return <SettingsPage theme={theme} setTheme={setTheme} />;
      default: return <HomePage />;
    }
  };

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen transition-colors duration-300 dark:bg-zinc-950 bg-zinc-50">
      <Topbar currentPage={currentPage} setPage={setPage} />
      {renderPage()}
    </div>
  );
}