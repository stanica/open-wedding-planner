import { Link, NavLink } from "react-router-dom";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useState } from "react";
import type { Theme } from "../lib/theme";

interface NavbarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 flex h-14 items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none">
            <rect width="32" height="32" rx="6" fill="#1a1a2e" />
            <circle
              cx="16"
              cy="13"
              r="5"
              stroke="#e94560"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M11 21.5C11 17.5 21 17.5 21 21.5"
              stroke="#e94560"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          Open Wedding Planner
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive
                ? "text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/docs"
            className={({ isActive }) =>
              isActive
                ? "text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            }
          >
            Docs
          </NavLink>
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-white/10 px-4 py-3 flex flex-col gap-3 text-sm bg-white dark:bg-gray-950">
          <NavLink
            to="/"
            end
            onClick={() => setMenuOpen(false)}
            className="text-gray-700 dark:text-gray-300"
          >
            Home
          </NavLink>
          <NavLink
            to="/docs"
            onClick={() => setMenuOpen(false)}
            className="text-gray-700 dark:text-gray-300"
          >
            Docs
          </NavLink>
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-700 dark:text-gray-300"
          >
            GitHub
          </a>
        </div>
      )}
    </header>
  );
}
