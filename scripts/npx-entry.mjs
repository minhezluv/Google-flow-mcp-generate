#!/usr/bin/env node
// npm / npx entry point (`npx -y @minhezluv/google-flow-mcp`). npm installs the dependencies
// next to the package, but the npx cache is disposable, so state (config, outputs, logs, daemon
// token) lives in FLOW_MCP_HOME, by default ~/.google-flow-mcp/home.
// stdout belongs to the MCP protocol: messages go to stderr.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedConfig } from './seed-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.FLOW_MCP_HOME ||= path.join(os.homedir(), '.google-flow-mcp', 'home');

const created = seedConfig(process.env.FLOW_MCP_HOME, path.join(ROOT, 'config', 'flow.config.example.json'));
if (created) process.stderr.write(`[google-flow-mcp] created ${created}\n`);

// Imported only after FLOW_MCP_HOME is set: config.js reads it at load time.
await import('../src/index.js');
