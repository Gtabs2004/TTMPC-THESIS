import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");

  // Only the preference lives here. The `dark` class on <html> is applied by
  // MemberLayout while a Member page is mounted, because the staff portals,
  // login pages and loan forms have no dark styling. The preference persists in
  // localStorage, so toggling the class globally used to wash out their
  // light-only badges and tables for anyone who had ever enabled dark mode.
  useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
