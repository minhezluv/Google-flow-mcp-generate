import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FLOW_MCP_HOME moves state (config, outputs, logs, daemon token) out of the code directory,
// which a Claude Code plugin replaces on every update.
const FLOW_HOME = process.env.FLOW_MCP_HOME || path.resolve(__dirname, '..', '..');

const configPath = path.join(FLOW_HOME, 'config', 'flow.config.json');
let config;

try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw);
} catch (err) {
  console.error(`[CONFIG] Failed to load config from ${configPath}: ${err.message}`);
  config = {};
}

// Plugin userConfig arrives as environment variables; an empty value means "not set".
const ENV_OVERRIDES = {
  expectedAccount: process.env.FLOW_EXPECTED_ACCOUNT,
  cdpPort: process.env.FLOW_CDP_PORT ? Number(process.env.FLOW_CDP_PORT) : undefined,
};
for (const [key, value] of Object.entries(ENV_OVERRIDES)) {
  if (value !== undefined && value !== '' && !Number.isNaN(value)) config[key] = value;
}

export default config;

export function get(key, fallback = undefined) {
  return config[key] !== undefined ? config[key] : fallback;
}

export function getFlowHome() {
  return config.flowHome || FLOW_HOME;
}
