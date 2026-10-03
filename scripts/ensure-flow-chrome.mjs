#!/usr/bin/env node
// Idempotent, cross-platform: ensures a dedicated Chrome/Edge for Google Flow listens on the CDP
// port. Already up -> READY. Otherwise launches it detached (it survives this script) and waits.
// Prints one line: READY | LAUNCHED | FAILED, for easy parsing.
// Usage: node ensure-flow-chrome.mjs [--port 9222] [--profile <dir>] [--browser <path>]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FLOW_URL = 'https://flow.google.com/';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const port = Number(arg('port') || process.env.FLOW_CDP_PORT || 9222);
const profile = arg('profile') || process.env.FLOW_CHROME_PROFILE || path.join(os.homedir(), '.google-flow-mcp', 'browser-profile');

function candidates() {
  const env = process.env;
  switch (process.platform) {
    case 'win32':
      return [
        path.join(env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
        path.join(env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
        path.join(env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
        path.join(env.ProgramFiles ?? 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
      ];
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ];
    default:
      return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/snap/bin/chromium', '/usr/bin/microsoft-edge'];
  }
}

async function cdpUp() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(4_000) });
    return response.ok;
  } catch {
    return false;
  }
}

if (await cdpUp()) {
  console.log(`READY: browser already up on CDP ${port}`);
  process.exit(0);
}

const browser = arg('browser') || process.env.FLOW_BROWSER_PATH || candidates().find((p) => p && fs.existsSync(p));
if (!browser) {
  console.log('FAILED: no Chrome or Edge found; pass --browser <path> or set FLOW_BROWSER_PATH');
  process.exit(1);
}

fs.mkdirSync(profile, { recursive: true });
const child = spawn(browser, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled',
  '--window-size=1920,1080',
  FLOW_URL,
], { detached: true, stdio: 'ignore' });
child.unref();

for (let i = 0; i < 15; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (await cdpUp()) {
    console.log(`LAUNCHED: browser up on CDP ${port} with profile ${profile}. On first use, sign in to Google in that window, then click "Sign in to Flow" if the landing page shows.`);
    process.exit(0);
  }
}
console.log(`FAILED: browser launched but CDP ${port} did not respond within 15s (another browser may already use profile ${profile})`);
process.exit(1);
