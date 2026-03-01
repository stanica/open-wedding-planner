import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { DocsLayout } from "./pages/docs/DocsLayout";
import { DocsIndex } from "./pages/docs/DocsIndex";
import { DocsConfiguration } from "./pages/docs/DocsConfiguration";
import { DocsAIProvider } from "./pages/docs/DocsAIProvider";
import { DocsWhatsApp } from "./pages/docs/DocsWhatsApp";
import { getTheme, setTheme, type Theme } from "./lib/theme";

export function App() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }

  return (
    <div className="min-h-screen bg-[#faf6f1] dark:bg-gray-950 text-stone-900 dark:text-gray-100 transition-colors">
      <Navbar theme={theme} onToggleTheme={toggleTheme} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsIndex />} />
          <Route path="configuration" element={<DocsConfiguration />} />
          <Route path="ai-provider" element={<DocsAIProvider />} />
          <Route path="whatsapp" element={<DocsWhatsApp />} />
        </Route>
      </Routes>
      <Footer />
    </div>
  );
}
