// Dependency-free helper shared by the plugin launcher and the npx entry point.
import fs from 'node:fs';
import path from 'node:path';

// Creates <home>/config/flow.config.json from the example on first run. The example carries
// placeholders (account, Chrome paths) that must not become live settings, so only the generic
// keys are kept. Returns the config path when it was created, otherwise null.
export function seedConfig(home, exampleFile) {
  const target = path.join(home, 'config', 'flow.config.json');
  if (fs.existsSync(target)) return null;
  const example = JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
  for (const key of ['expectedAccount', 'chromeUserDataDir', 'chromePath']) delete example[key];
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(example, null, 2)}\n`);
  return target;
}
