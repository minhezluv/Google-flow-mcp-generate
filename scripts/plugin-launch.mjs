#!/usr/bin/env node
// Claude Code plugin entry point for the google-flow MCP server. Dependency-free on purpose:
// a plugin ships without node_modules, so this copies the server into ${CLAUDE_PLUGIN_DATA},
// installs its dependencies there once (again only when package-lock.json changes), seeds a
// default config, and then runs src/index.js over the inherited stdio.
// stdout belongs to the MCP protocol: everything this script reports goes to stderr.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedConfig } from './seed-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.google-flow-mcp', 'plugin-data');
const APP = path.join(DATA, 'app');
const HOME = path.join(DATA, 'home');
const COPIED = ['src', 'config', 'package.json', 'package-lock.json'];

const log = (message) => process.stderr.write(`[google-flow plugin] ${message}\n`);

function hash(parts) {
  const h = crypto.createHash('sha256');
  for (const part of parts) h.update(String(part)).update('\0');
  return h.digest('hex');
}

// Fingerprint of the shipped code: relative path, size and mtime of every copied file.
function codeStamp() {
  const parts = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) for (const name of fs.readdirSync(abs).sort()) walk(path.join(rel, name));
    else parts.push(rel, stat.size, stat.mtimeMs);
  };
  for (const rel of COPIED) if (fs.existsSync(path.join(ROOT, rel))) walk(rel);
  return hash(parts);
}

function readStamp(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; }
}

// Two sessions can start at once; only one may copy and install.
async function withInstallLock(fn) {
  const lock = path.join(DATA, '.install-lock');
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      if (age > 10 * 60_000) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`install lock ${lock} held for too long`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  try { return await fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

function syncApp() {
  const stampFile = path.join(APP, '.code-stamp');
  const stamp = codeStamp();
  if (readStamp(stampFile) === stamp) return;
  log(`updating server code in ${APP}`);
  fs.mkdirSync(APP, { recursive: true });
  for (const rel of COPIED) {
    fs.rmSync(path.join(APP, rel), { recursive: true, force: true });
    if (fs.existsSync(path.join(ROOT, rel))) fs.cpSync(path.join(ROOT, rel), path.join(APP, rel), { recursive: true });
  }
  fs.writeFileSync(stampFile, stamp);
}

function installDependencies() {
  const stampFile = path.join(APP, '.deps-stamp');
  const stamp = hash([fs.readFileSync(path.join(APP, 'package-lock.json'), 'utf8'), process.version]);
  if (readStamp(stampFile) === stamp && fs.existsSync(path.join(APP, 'node_modules'))) return;
  log('installing dependencies (first run or after an update, about a minute)');
  // One fixed command string through the shell: finds npm/npm.cmd on every platform.
  const result = spawnSync('npm ci --omit=dev --no-audit --no-fund --loglevel=error',
    { cwd: APP, stdio: ['ignore', process.stderr, process.stderr], shell: true });
  if (result.status !== 0) throw new Error(`npm ci failed in ${APP} (exit ${result.status ?? result.signal})`);
  fs.writeFileSync(stampFile, stamp);
}


async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Node.js 22 or newer is required (found ${process.version})`);
  fs.mkdirSync(DATA, { recursive: true });
  await withInstallLock(async () => {
    syncApp();
    installDependencies();
    const created = seedConfig(HOME, path.join(APP, 'config', 'flow.config.example.json'));
    if (created) log(`created ${created}`);
  });

  const child = spawn(process.execPath, [path.join(APP, 'src', 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env, FLOW_MCP_HOME: HOME },
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

main().catch((err) => {
  log(`failed to start: ${err.message}`);
  process.exit(1);
});
