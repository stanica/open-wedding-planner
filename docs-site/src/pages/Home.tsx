import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  MessageCircle,
  DollarSign,
  Globe,
  Bot,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const SCREENSHOTS = [
  { src: "dashboard.png", alt: "Dashboard overview", label: "Dashboard" },
  { src: "research.png", alt: "AI research agent", label: "Research" },
  { src: "vendor.png", alt: "Vendor details", label: "Vendors" },
];

const FEATURES = [
  {
    icon: Bot,
    title: "AI Research Agent",
    description:
      "Ask it to find vendors and it'll search the web, scrape sites, read PDFs, and put together vendor profiles for you. It can even spin up a headless browser for JavaScript-heavy pages.",
  },
  {
    icon: Search,
    title: "Vendor Management",
    description:
      "Keep track of every vendor in one place — contact info, quotes, photos, notes, and where you're at with each one. Filter and sort however you like.",
  },
  {
    icon: DollarSign,
    title: "Budget Tracking",
    description:
      "Break your budget down by category, track quotes and what you've actually spent. A summary bar keeps the big picture visible.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Integration",
    description:
      "Link your personal WhatsApp by scanning a QR code — no Business API needed. Message vendors right from the app, with optional draft approval so nothing gets sent by accident.",
  },
  {
    icon: Globe,
    title: "Cloudflare Tunnel",
    description:
      "Need to access the app from your phone or another computer? One click opens a temporary Cloudflare tunnel. No account or port forwarding required.",
  },
  {
    icon: Shield,
    title: "Runs on Your Machine",
    description:
      "Your data stays in a local SQLite database. Nothing gets sent anywhere unless you tell it to. No accounts, no subscriptions.",
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

function ScreenshotCarousel() {
  const [index, setIndex] = useState(0);
  const prev = () =>
    setIndex((i) => (i - 1 + SCREENSHOTS.length) % SCREENSHOTS.length);
  const next = () => setIndex((i) => (i + 1) % SCREENSHOTS.length);
  const { src, alt } = SCREENSHOTS[index];

  return (
    <section className="mx-auto max-w-5xl px-4 mb-24">
      <div className="relative">
        <img
          src={`${import.meta.env.BASE_URL}${src}`}
          alt={alt}
          className="w-full rounded-xl border border-stone-200 dark:border-white/10 shadow-sm"
        />
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 dark:bg-black/50 p-2 shadow-md backdrop-blur-sm hover:bg-white dark:hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="h-5 w-5 text-stone-700 dark:text-gray-300" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 dark:bg-black/50 p-2 shadow-md backdrop-blur-sm hover:bg-white dark:hover:bg-black/70 transition-colors"
        >
          <ChevronRight className="h-5 w-5 text-stone-700 dark:text-gray-300" />
        </button>
      </div>
      <div className="flex justify-center gap-3 mt-4">
        {SCREENSHOTS.map((s, i) => (
          <button
            key={s.src}
            onClick={() => setIndex(i)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              i === index
                ? "bg-stone-800 text-white dark:bg-white dark:text-stone-900"
                : "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-white/20"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-stone-300 dark:border-white/20 bg-stone-100 dark:bg-white/10 px-3 py-1 text-xs font-medium text-stone-600 dark:text-gray-300 mb-6">
          Open source · Runs locally · MIT license
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-stone-900 dark:text-white mb-6">
          AI for planning your {" "}
          <span
            className="text-7xl sm:text-8xl lg:text-8xl text-stone-900 dark:text-white"
            style={{ fontFamily: "'Lavishly Yours', cursive" }}
          >
            wedding
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-stone-600 dark:text-gray-400 mb-10">
          Research vendors with AI, track your budget, message vendors on
          WhatsApp — all from one app that runs locally on your computer.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto rounded-lg bg-stone-800 hover:bg-stone-700 dark:bg-white dark:hover:bg-gray-200 px-6 py-3 text-sm font-semibold text-white dark:text-stone-900 transition-colors"
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

      {/* Screenshots */}
      <ScreenshotCarousel />

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 mb-24">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-stone-900 dark:text-white mb-12">
          What it does
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-6"
            >
              <div className="mb-3 inline-flex rounded-lg bg-stone-200 dark:bg-white/10 p-2">
                <Icon className="h-5 w-5 text-stone-600 dark:text-gray-400" />
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
          Getting started
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map(({ step, title, code }) => (
            <div
              key={step}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-6"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 dark:bg-white text-sm font-bold text-white dark:text-stone-900">
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
            className="text-stone-900 dark:text-white hover:underline"
          >
            Full setup guide →
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 mb-24">
        <div className="rounded-2xl bg-stone-800 dark:bg-white/10 border border-stone-700 dark:border-white/20 px-8 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Like what you see?
          </h2>
          <p className="text-stone-300 dark:text-gray-400 mb-8 max-w-xl mx-auto">
            The whole thing is open source and MIT licensed. Contributions
            welcome.
          </p>
          <a
            href="https://github.com/stanica/open-wedding-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-white text-stone-800 hover:bg-gray-100 px-6 py-3 text-sm font-semibold transition-colors"
          >
            Check it out on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
