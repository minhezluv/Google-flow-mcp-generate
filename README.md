# google-flow-mcp

MCP server that generates **images and video on [Google Flow](https://labs.google/flow)**
through browser automation, so you can use your own **Google AI Pro** subscription
instead of paying per-credit services. Ships with a Claude Code skill.

Validated end-to-end: images (Nano Banana / Imagen) and video (Veo 3.1 / Omni Flash)
are generated in a real Flow project and downloaded to disk.

> Adapted and hardened for the current agent-first Flow UI (and Windows) from
> [TMSSS05/google-flow-browser-mcp](https://github.com/TMSSS05/google-flow-browser-mcp).

## What it does

Playwright connects over the Chrome DevTools Protocol to a dedicated Chrome that is
logged into your Google account. It drives Flow's agent to generate media and
downloads the result through the authenticated session. **No API keys, no password
handling** — it uses your existing browser session.

Tools (17): `flow_connect`, `flow_status`, `flow_account_check`, `flow_discover_ui`,
`flow_generate_image`, `flow_generate_video`, `flow_download_latest`, character/scene
tools, `flow_use_grid_architect`, `flow_screenshot`, `flow_queue_status`, …

## ⚠️ Terms of Service

This is **unofficial browser automation**. There is no official Google API for Flow.
The launcher starts Chrome directly so `navigator.webdriver` is false, which is an
explicit anti-bot measure. Automating Google properties can violate Google's Terms of
Service and may put your account at risk. **Use at your own risk, on your own account.**

## Requirements

- Node.js ≥ 22 (with npm)
- Google Chrome or Microsoft Edge (Chrome 149+ needs Playwright ≥ 1.61.1, already pinned)
- A Google account with access to Flow (Google AI Pro recommended)

## Install as a Claude Code plugin

This repository is both a Claude Code plugin and a plugin marketplace. The plugin bundles the
MCP server and the `google-flow-generate` skill.

```bash
claude plugin marketplace add minhezluv/Google-flow-mcp-generate
claude plugin install google-flow@google-flow-mcp
```

Or inside a session: `/plugin marketplace add minhezluv/Google-flow-mcp-generate`, then
`/plugin install google-flow@google-flow-mcp`.

When the plugin is enabled, Claude Code asks for two optional settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| Google account | empty | Gmail address that must be signed in to Flow; empty skips the check |
| Browser debugging port | 9222 | CDP port of the dedicated browser |

On the first tool call the server copies itself to the plugin data directory
(`~/.claude/plugins/data/<plugin-id>/`), runs `npm ci` there (about a minute) and creates
`home/config/flow.config.json`, where the remaining settings live. Outputs, logs and the job
store are kept under that `home/` directory, so they survive plugin updates.

Then ask Claude for an image or a video. The skill starts the dedicated browser with
`scripts/ensure-flow-chrome.mjs` (Windows, macOS, Linux). On first use, sign in to Google in
that window and click "Sign in to Flow"; the profile in `~/.google-flow-mcp/browser-profile`
keeps the session.

To try a local checkout without the marketplace: `claude --plugin-dir .`

## Use with any MCP client (npm)

The server is published on npm as `@minhezluv/google-flow-mcp` and listed in the
[MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.minhezluv/google-flow`.
Add it to your client's MCP configuration (Claude Desktop, Cursor, VS Code, …):

```json
{
  "mcpServers": {
    "google-flow": {
      "command": "npx",
      "args": ["-y", "@minhezluv/google-flow-mcp"],
      "env": { "FLOW_EXPECTED_ACCOUNT": "you@gmail.com" }
    }
  }
}
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLOW_EXPECTED_ACCOUNT` | unset | Gmail address that must be signed in to Flow |
| `FLOW_CDP_PORT` | 9222 | CDP port of the dedicated browser |
| `FLOW_MCP_HOME` | `~/.google-flow-mcp/home` | Config, outputs, logs and job store |

Before generating, start the dedicated browser and sign in to Google and Flow in it once:

```bash
npx -y -p @minhezluv/google-flow-mcp google-flow-chrome
```

## Manual setup (from a checkout)

```bash
npm install
cp config/flow.config.example.json config/flow.config.json
# edit config/flow.config.json → set expectedAccount and chromeUserDataDir
```

Start the dedicated Chrome (idempotent — launches only if needed):

```bash
node scripts/ensure-flow-chrome.mjs        # any OS; --port, --profile, --browser optional
powershell -File scripts/ensure-flow-chrome.ps1   # Windows-only original
```

First run: in that Chrome window, sign in to your Google account **and** click
**"Sign in to Flow"** on labs.google (Flow uses a separate sign-in). The session is
saved in the dedicated profile and reused.

Register the server with your MCP client (Claude Code, etc.):

```json
{
  "mcpServers": {
    "google-flow": { "type": "stdio", "command": "node", "args": ["<path>/src/index.js"] }
  }
}
```

Restart the client afterwards (the server loads into memory at startup).

## Daemon

Only one process may drive the Flow Chrome. `src/daemon/main.js` owns it, keeps a serial job
queue in `data/jobs.json` and listens on `127.0.0.1:47821` (`daemonPort`). The MCP server starts
the daemon on first use and forwards every tool call to it; other programs (for example the
Hypit provider) submit generation jobs over HTTP.

```bash
npm run daemon
curl http://127.0.0.1:47821/health
```

Requests other than `/health` need `authorization: Bearer <config/daemon-token>`; the token is
created on first start.

| Route | Purpose |
| --- | --- |
| `GET /health` | Chrome, sign-in and queue state |
| `GET /credits` | Current credit balance; authenticated and serialized under the browser lock |
| `POST /uploads` | Reference image bytes (PNG/JPEG/WebP) → `{ id }` |
| `POST /jobs` | `{ kind, model, prompt, aspectRatio, duration?, references?, firstFrame?, lastFrame?, ingredients?, project?, confirmCredits, idempotencyKey }` |
| `GET /jobs/:id` | `queued` · `running` · `succeeded` · `failed` · `interrupted`, with phase and outputs |
| `GET /jobs/:id/outputs/:n` | Generated file |
| `POST /tools/:name` | Run one MCP tool under the browser lock |

Every generation job needs `confirmCredits: true`. A repeated `idempotencyKey` returns the
existing queued, running or succeeded job instead of spending credits again.

Models: `nano-banana-2`, `nano-banana-pro`, `nano-banana-2-lite`, `veo-3.1-lite`, `veo-3.1-fast`,
`veo-3.1-quality`, `omni-flash` (Omni 1.1 Flash). Images accept ratios 16:9, 4:3, 1:1, 3:4, 9:16;
videos 16:9 and 9:16. Reference images (image jobs), first/last frames and ingredients (video jobs)
are uploaded through Flow's ingredient picker.

The driver targets `https://flow.google.com/`, finds controls by their Material icon names, sets
model/ratio/count in Flow's settings panel before each job and switches Flow's "confirm before
generating" option to "never" — the daemon's `confirmCredits` flag is the spending gate. It refuses
to run when the signed-in account differs from `expectedAccount`. Flow adds a visible AI watermark
  in some regions.

The prompt names the exact model and forbids substitution. After rendering, the driver reloads
the finished project's persisted history and checks its `model_display_name` against the media
id before downloading. It reads the UI's observed `GN0Bre` batchexecute response; unknown or
ambiguous metadata fails with `UI_CHANGED`, and a substituted model fails with `UNSUPPORTED_INPUT`.
Neither failure submits another generation. Verified signed media URLs stay in a bounded in-memory
cache so download retries do not rely on opaque thumbnails after reload.

The check runs after Flow has already charged for the render. If Flow changes that undocumented
response and every job starts failing with `UI_CHANGED`, set `"verifyModel": false` in
`config/flow.config.json` and restart the daemon: results are then downloaded without the model
check, so a silent model substitution would go unnoticed until the check is repaired.

Live measurements on 2026-10-01: Nano Banana 2/Pro/2 Lite images cost 0; Veo Lite/Fast/Quality
8-second text videos cost 10/20/100; Omni Flash text at 6 seconds costs 10, and its 8-second
first+last-frame or single-ingredient modes cost 12. Flow silently changed requested Lite
frame-pair/ingredient jobs to Omni in earlier tests; request Omni explicitly for these modes.
See [capabilities](docs/capabilities.md) for the measured scope.

After updating, restart your MCP client so it loads the proxy version of the server.

## Notes that matter

- **Images are effectively free** against the monthly Flow credit pool; **video
  consumes credits** (Veo 3.1 Lite ~10, Fast ~20, Quality ~100; Omni Flash 10 for 6s text / 12 for 8s references, out of
  ~1000/month). Video shows a credit-confirmation dialog which the server approves.
- **Model/duration must be a valid combo** or Flow's agent asks for clarification and
  nothing generates (e.g. Veo 3.1 Lite is 8s-only on the Pro plan; measured Omni modes are 6s text and 8s references).
- Flow is **agent-first**: prompts are wrapped imperatively so the agent generates
  directly instead of asking questions.
- The UI language follows your Google account; navigation selectors cover IT/FR/EN.

## Claude Code skill

The plugin installs the skill automatically. Without the plugin, copy
`skills/google-flow-generate/` to `~/.claude/skills/` and replace `${CLAUDE_PLUGIN_ROOT}` and
`${user_config.cdp_port}` in its `SKILL.md` with your checkout path and port.

## Releasing

Keep these versions equal: `package.json`, `server.json` (`version` and `packages[0].version`)
and `.claude-plugin/plugin.json`. Then:

```bash
npm test
claude plugin validate --strict .
npm publish --access public          # npm package used by npx and the MCP Registry
mcp-publisher login github           # once; the account must be minhezluv
mcp-publisher publish                # reads server.json
git push                             # plugin marketplace users get the update
```

## License

MIT — see [LICENSE](./LICENSE).

`videoCooldownMs` (default 30000) spaces video jobs: each video waits that long after the previous
one finished. Three Veo jobs submitted back to back were each rejected within ~27 s with Flow's
generic "something went wrong" tile, and the failures still consumed credits. Images do not wait.
