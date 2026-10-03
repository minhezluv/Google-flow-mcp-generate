---
name: google-flow-generate
description: |
  Generate images and video with the user's Google AI Pro/Ultra subscription through
  Google Flow (flow.google.com), driven by browser automation through this plugin's
  google-flow MCP server. Use when the user asks to generate an image, a video, a
  character, a storyboard or a multi-scene clip, and no other generation service is
  named. Images do not use Flow credits; video does.
---

# Google Flow Generate

Runbook for the `google-flow` MCP server bundled with this plugin. Its tools are named
`flow_*` (in tool lists they appear with the plugin's MCP prefix, for example
`mcp__plugin_google-flow_google-flow__flow_generate_image`).

## Step 0: make sure the dedicated browser is up (always first)

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-flow-chrome.mjs" --port ${user_config.cdp_port}
```

- `READY` or `LAUNCHED`: continue.
- `LAUNCHED` on first use: the browser profile is new. Ask the user to sign in to
  Google in that window and click "Sign in to Flow" if the landing page shows, then
  continue. The profile keeps the login afterwards.
- `FAILED`: report the line to the user and stop. `--browser <path>` points it at a
  Chrome or Edge executable that was not found automatically.

The first MCP call after installing or updating the plugin can take about a minute
while the server installs its dependencies.

## Step 1: connect

Call `flow_connect`.
- `status: connected`: continue.
- `status: oauth_required`: the user signs in to Flow in the browser, then retry.
- `WRONG_GOOGLE_ACCOUNT`: stop; the signed-in account differs from the plugin's
  configured Google account.
- `accountVerified.method: "assumed"` means the account was not verified.

## Step 2: write a faithful prompt (always)

Turn the request into a rich prompt without changing its intent:
- Keep every element the user named. Do not add subjects, objects or text they did
  not ask for. Keep explicit constraints verbatim ("red mug, no logo").
- Add supporting detail: subject, action, setting, lighting, composition, style,
  mood; for video also camera movement and pacing.
- For video, describe the soundtrack as "Audio (soundtrack only): ...". Naming an
  instrument outside that phrase can put the instrument in the picture.
- Add "No text, no labels, no captions" to images unless text is wanted.
- Match `ratio` to the use: 16:9 scenes, 9:16 Shorts/Reels, 1:1 icons.

## Step 3: images (no credits)

`flow_generate_image` with `auto_confirm: true`. Models: `Nano Banana 2` (default),
`Nano Banana Pro` (best fidelity, prefer for anything complex). Pass
`reference_images` (local paths) to keep a character or setting consistent. Use the
same `project_name` and `campaign` for every asset of one piece of work.

Verify every result: open the saved file and compare it with the request element by
element. If something is missing or wrong, sharpen that part of the prompt and
regenerate (images are free, up to 3 tries).

## Step 4: video (uses credits; confirm first)

`flow_generate_video` with `auto_confirm: true` submits, renders (about 1-2 minutes)
and downloads the mp4. Before spending, tell the user the number of clips, the model
and the expected credits, and get their go-ahead.

- Models: `lite` (Veo 3.1 Lite), `fast` (Veo 3.1 Fast), `quality` (Veo 3.1 Quality),
  `flash` (Omni Flash). Observed cost on a Pro plan: Fast about 20 credits per 8 s clip
  with reference images. Read the real balance in Flow's account menu instead of
  trusting estimates, and recheck it after the first few clips of a large job.
- With `reference_images`, Veo 3.1 Fast accepts only `duration: "8s"` on Pro; other
  durations make Flow's agent refuse without generating. Veo 3.1 Lite is 8 s only.
- `auto_confirm: false` prepares the job without spending anything.

### Consistent multi-scene work (films, series, Shorts)

1. Generate reference images first (free): each character on a plain background and
   each setting. Check them.
2. Optionally generate a keyframe image per shot (free) and check it.
3. Generate each 8 s clip with the relevant references (at most 3) and a prompt that
   restates the character's key traits.
4. Extract frames to check every clip (for example with ffmpeg
   `-vf "fps=0.5,scale=240:-1,tile=4x1"`) and regenerate only the clips that miss.
5. Assemble with ffmpeg: scale every clip to one size, fps and 48 kHz audio, then join
   with `xfade`/`acrossfade` and normalize loudness. For Shorts, place 16:9 clips over a
   blurred 9:16 background. Use a font with full Vietnamese/Unicode coverage (such as
   Segoe UI) and NFC-normalized text for on-screen titles.

## Errors

| Error | Action |
|---|---|
| `oauth_required`, `MANUAL_VERIFICATION_REQUIRED` | Stop; the user signs in or solves the captcha in the browser |
| `WRONG_GOOGLE_ACCOUNT` | Stop; account mismatch |
| `BROWSER_NOT_CONNECTED`, `NOT_LOGGED_IN`, `FLOW_PAGE_NOT_FOUND` | Rerun step 0, then retry once |
| "Flow's agent stopped without producing media" | Take `flow_screenshot` and read the agent's reply; usually an unsupported model/duration combination. No credits were spent |
| "Flow project page has no prompt bar" | A settings panel was left open; take `flow_screenshot`, close it, retry |
| `GENERATION_TIMEOUT`, `UNKNOWN_UI_CHANGE` | `flow_screenshot`, then `flow_discover_ui`; report |
| `GOOGLE_LIMIT_REACHED` | Credits are used up; tell the user |
| `DOWNLOAD_FAILED`, or an error after the render finished | Do not regenerate (credits are spent). Use `flow_download_latest`, or open the Flow project for the user to download |
