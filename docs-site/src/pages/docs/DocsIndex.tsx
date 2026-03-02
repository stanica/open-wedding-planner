import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/CodeBlock";

export function DocsIndex() {
  return (
    <>
      <h1>Introduction</h1>
      <p>
        Open Wedding Planner is an AI-powered desktop app for planning your
        wedding. It runs entirely on your machine — your data stays in a local
        SQLite database and never leaves your computer.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 22 or later</li>
        <li>
          Playwright Chromium — required for the browser research agent:
          <CodeBlock>npx playwright install chromium</CodeBlock>
        </li>
      </ul>

      <h2>Installation</h2>
      <CodeBlock>{`git clone git@github.com:stanica/open-wedding-planner.git
cd open-wedding-planner
npm install`}</CodeBlock>

      <h2>Running in development</h2>
      <CodeBlock>npm run dev</CodeBlock>
      <p>
        This builds the shared package and starts the gateway and Electron app
        in watch mode.
      </p>

      <h2>Building a distributable</h2>
      <CodeBlock>npm run package --workspace=packages/app</CodeBlock>
      <p>
        Produces a macOS DMG, Windows NSIS installer, or Linux AppImage
        depending on your platform. The build script automatically downloads the
        Playwright headless shell and cloudflared binary.
      </p>

      <h2>Next steps</h2>
      <p>
        Once the app is running, head to <strong>Settings</strong> to configure
        your AI provider and wedding details. See the{" "}
        <Link to="/docs/configuration">Settings overview</Link> for a full
        walkthrough.
      </p>
    </>
  );
}
