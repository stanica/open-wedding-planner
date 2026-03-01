import { Link } from "react-router-dom";
import {
  Search,
  MessageCircle,
  DollarSign,
  Globe,
  Bot,
  Shield,
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "AI Research Agent",
    description:
      "Chat with an AI that searches the web, scrapes vendor sites, parses PDFs, and builds out vendor profiles automatically. Spawns headless browser subagents for JavaScript-heavy sites.",
  },
  {
    icon: Search,
    title: "Vendor Management",
    description:
      "Track vendors by category with status progression, quotes, photo galleries, contact info, and custom attributes. Grid and table views with filtering and sorting.",
  },
  {
    icon: DollarSign,
    title: "Budget Tracking",
    description:
      "Category-based budget allocation with quote line items and actual spend tracking. A summary bar shows total budget, committed spend, and remaining balance at a glance.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Integration",
    description:
      "Connect your personal WhatsApp via QR code — no Business API required. Send and receive messages with vendors directly from the app, with draft approval before sending.",
  },
  {
    icon: Globe,
    title: "Cloudflare Tunnel",
    description:
      "Expose the app to the internet via a temporary Cloudflare URL with one click. No account or port forwarding needed — useful for remote access or webhooks.",
  },
  {
    icon: Shield,
    title: "Fully Local",
    description:
      "Everything runs on your machine. Your data stays in a local SQLite database at ~/.wedding-planner. No cloud sync, no subscriptions, no vendor lock-in.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Clone & install",
    code: "git clone git@github.com:stanica/open-wedding-planner.git\nnpm install",
  },
  {
    step: "2",
    title: "Install Chromium",
    code: "npx playwright install chromium",
  },
  { step: "3", title: "Run in dev mode", code: "npm run dev" },
];

export function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-6">
          Open source · Runs locally · MIT license
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-stone-900 dark:text-white mb-6">
          Plan your wedding{" "}
          <span className="text-indigo-600 dark:text-indigo-400">with AI</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-stone-600 dark:text-gray-400 mb-10">
          An open-source desktop app that combines AI-powered vendor research,
          budget tracking, and WhatsApp messaging — all running on your own
          machine.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-colors"
          >
            View on GitHub
          </a>
          <Link
            to="/docs"
            className="w-full sm:w-auto rounded-lg border border-stone-300 dark:border-white/20 hover:border-stone-400 dark:hover:border-white/40 px-6 py-3 text-sm font-semibold text-stone-700 dark:text-gray-300 transition-colors"
          >
            Read the docs →
          </Link>
        </div>
      </section>

      {/* Screenshot placeholder */}
      <section className="mx-auto max-w-5xl px-4 mb-24">
        <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 aspect-video flex items-center justify-center">
          <p className="text-sm text-stone-400 dark:text-gray-600">
            Screenshots coming soon
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 mb-24">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-stone-900 dark:text-white mb-12">
          Everything you need to plan a wedding
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-6"
            >
              <div className="mb-3 inline-flex rounded-lg bg-indigo-100 dark:bg-indigo-500/20 p-2">
                <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-stone-600 dark:text-gray-400 leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Getting started */}
      <section className="mx-auto max-w-6xl px-4 mb-24">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-stone-900 dark:text-white mb-12">
          Get started in minutes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map(({ step, title, code }) => (
            <div
              key={step}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-6"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {step}
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-white mb-3">
                {title}
              </h3>
              <pre className="rounded-lg bg-gray-900 dark:bg-black/40 px-4 py-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {code}
              </pre>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-stone-500 dark:text-gray-500 mt-6">
          Requires Node.js 22+.{" "}
          <Link
            to="/docs"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Full setup guide →
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 mb-24">
        <div className="rounded-2xl bg-indigo-600 dark:bg-indigo-500/20 border border-indigo-500/30 px-8 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white dark:text-white mb-4">
            Ready to start planning?
          </h2>
          <p className="text-indigo-200 dark:text-indigo-300 mb-8 max-w-xl mx-auto">
            Open source, MIT licensed. Your data never leaves your machine.
          </p>
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-3 text-sm font-semibold transition-colors"
          >
            Star on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
