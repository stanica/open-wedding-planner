export function Footer() {
  return (
    <footer className="border-t border-stone-200 dark:border-white/10 mt-24">
      <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500 dark:text-gray-500">
        <p>Open Wedding Planner — open source, runs on your machine.</p>
        <a
          href="https://github.com/stanica/open-wedding-planner"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-stone-900 dark:hover:text-white transition-colors"
        >
          GitHub →
        </a>
      </div>
    </footer>
  );
}
