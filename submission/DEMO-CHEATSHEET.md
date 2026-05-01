# Demo Recording Cheatsheet

Print this or keep it open on your phone while recording.

---

## Setup
- Chrome, 1920x1080, 90% zoom, no extensions, single tab
- Dark terminal (VS Code or iTerm) ready in background
- OBS or QuickTime recording

---

## Clicks & Screens (in order)

```
TERMINAL ──────────────────────────────────────
  npm install agenticproof
  npx receipt --help          ← show the ASCII receipt banner
  
BROWSER ───────────────────────────────────────
  1. receipt-murex.vercel.app     (landing page — scroll slowly)
  2. Click "See It Work"          (→ /demo page)
  3. Click "Start Demo"           (honest mode — wait for completion)
  4. Point at quality score       (bottom bar: verification rate, cost)
  5. Point at 0G Verification     (3 green checkmarks in center)
  6. Click a TX link              (→ 0G Mainnet explorer, quick flash)
  7. Click "Now Try Adversarial"  (bottom bar button — auto-starts)
  8. Wait for REJECTED            (screen shake, red flash)
  9. Click "Verify This Chain"    (→ /verify page)
  10. Watch checkmarks flip green
  11. Back to landing page        (end on npm install badge)
```

---

## Key Lines to Say

**Opening (terminal):**
> "Cursor built keep rates for code. But what about everything else agents do? There's no keep rate for research, transactions, or analysis. RECEIPT is that layer."

**After npm install:**
> "This SDK plugs into any agent — Claude Code, Cursor, OpenClaw."

**During honest demo:**
> "Every action gets a signed receipt. The Builder verifies every claim independently."

**Quality score moment:**
> "82 out of 100. Not just 'did the agent run' — was the output worth paying for?"

**Before adversarial:**
> "Agents claimed 100% completion. Verification confirmed 73%. Watch the 27%."

**After REJECTED:**
> "The lie is cryptographic — you can't argue with math. Chain rejected."

**Verify page:**
> "Anyone can verify. Client-side, no server. Proof that doesn't require trust."

**Close:**
> "npm install agenticproof. The evaluation layer every agent harness needs."

---

## Timing

| Beat | What | Time |
|------|------|------|
| 1 | Terminal + npm install | 0:00–0:30 |
| 2 | Landing page scroll | 0:30–0:55 |
| 3 | Honest demo | 0:55–1:55 |
| 4 | Adversarial mode | 1:55–2:35 |
| 5 | Verify page | 2:35–2:50 |
| 6 | Close on npm badge | 2:50–3:00 |

Speed up inference wait (10s) to 2x. Everything else 1x.
