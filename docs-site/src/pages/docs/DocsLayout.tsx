import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  {
    label: "Getting Started",
    links: [{ to: "/docs", label: "Introduction", end: true }],
  },
  {
    label: "Configuration",
    links: [
      { to: "/docs/configuration", label: "Settings overview" },
      { to: "/docs/ai-provider", label: "AI provider" },
      { to: "/docs/whatsapp", label: "WhatsApp" },
      { to: "/docs/voice-calling", label: "Voice calling" },
    ],
  },
];

export function DocsLayout() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 flex gap-12">
      {/* Sidebar */}
      <aside className="hidden md:block w-52 shrink-0">
        <nav className="sticky top-20 space-y-6">
          {NAV.map((section) => (
            <div key={section.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-gray-500">
                {section.label}
              </p>
              <ul className="space-y-1">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={"end" in link ? link.end : false}
                      className={({ isActive }) =>
                        `block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          isActive
                            ? "bg-amber-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                            : "text-stone-600 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main
        className="flex-1 min-w-0 prose prose-gray dark:prose-invert max-w-none
        prose-headings:font-bold prose-headings:tracking-tight
        prose-code:rounded prose-code:bg-stone-100 prose-code:dark:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-gray-900 prose-pre:dark:bg-black/40 prose-pre:rounded-xl
        prose-a:text-indigo-600 prose-a:dark:text-indigo-400 prose-a:no-underline hover:prose-a:underline"
      >
        <Outlet />
      </main>
    </div>
  );
}
