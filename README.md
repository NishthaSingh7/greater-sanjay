# Greater Sanjay

**A universal screen-based control layer for macOS — built from scratch at the [Cursor Buildathon](https://cursor.com).**

Greater Sanjay is a **system control orchestration product for enterprise laptops**. Tell it what you want in plain English; it sees your screen, decides the next UI action, and executes it through mouse and keyboard — until the task is actually done.

> **Why “Sanjay”?** In the Mahabharata, Sanjay narrated everything happening in the war to Dhritarashtra **without being on the battlefield**. Similarly, Greater Sanjay sees what’s happening on your laptop and controls it — **without plugging into every app individually**.

---

## Authors

| | |
|---|---|
| **Nishtha Singh** | Co-creator |
| **[Samarth Goyal](https://github.com/igoyalsamarth)** | Co-creator |

Built in **4 hours** at the Cursor Buildathon (12 PM – 4 PM). Demo day had bugs; the idea didn’t. Still actively building.

---

## The problem

Modern AI agents often depend on **separate MCP or API integrations for every app** — Chrome, Cursor, Spotify, Terminal, and more. That creates:

- Fragmentation across tools
- Setup and maintenance overhead
- Gaps where no integration exists

## Our solution

A **universal screen-based control layer** that works across apps because it operates from **what’s visible on screen** — not from app-native tool exposure.

| Traditional approach | Greater Sanjay |
|---|---|
| One integration per app | One control path for all software |
| Browser-only agents | **System-level** actions (Spotlight, apps, folders, Terminal) |
| “I tried” completion | Screenshot **verification** before success |

---

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Screenshot │ ──► │ Vision model │ ──► │ JSON action │ ──► │ Mouse/keyboard│
│  (observe)  │     │  (Ollama)    │     │ click/type  │     │  (execute)    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
       ▲                                                              │
       └──────────────────── repeat until verified ──────────────────┘
```

1. **Observe** — capture the current screen
2. **Analyze** — local vision model interprets the UI
3. **Act** — structured output becomes clicks, keystrokes, or shortcuts
4. **Verify** — fresh screenshot confirms the task really completed

**Fast-path playbooks** handle common flows (Spotlight launch, Spotify search, Chrome URLs, YouTube seek) without waiting on the vision model every step.

---

## Example tasks

```
Open Spotify and play lo-fi music
Open YouTube and play Dynamic Programming by Aditya video and play after 5 minutes
Open Terminal
Start a Google Meet with camera off
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | **Electron** + TypeScript |
| Local AI | **Ollama** (100% on-device) |
| Vision model | `qwen2.5vl:7b` (screenshot → action JSON) |
| Reasoning model | `deepseek-r1:8b` (task planning) |
| Input automation | `@nut-tree-fork/nut-js` (mouse, keyboard) |
| Validation | Zod action schemas + strict completion checks |

### Why Gemma 4?

We evaluated **Gemma 4** for its **encoder-free** architecture — it reduces the usual image encode/decode overhead, enabling **faster screenshot analysis cycles** in the agent loop. The same integration path also supports audio; our hackathon focus was **image** (screen-in, action-out).

---

## Requirements

- **macOS** (primary target)
- [Ollama](https://ollama.com) running locally
- macOS permissions:
  - **Accessibility** (mouse & keyboard control)
  - **Screen Recording** (screenshots)

---

## Quick start

```bash
# Clone
git clone https://github.com/NishthaSingh7/greater-sanjay.git
cd greater-sanjay

# Install
npm install

# Pull Ollama models
ollama pull qwen2.5vl:7b
ollama pull deepseek-r1:8b

# Run in development
npm run dev
```

Grant **Accessibility** and **Screen Recording** when prompted (System Settings → Privacy & Security).

### Other commands

```bash
npm run build    # Compile TypeScript
npm run verify   # Run core verification tests
npm run package  # Build macOS DMG
```

---

## Project structure

```
src/
├── main/
│   ├── llm/           # Ollama client, prompts, playbooks, task completion
│   └── services/      # Control loop, screenshots, action executor
├── renderer/          # Electron UI (live feed, mission control, config)
└── shared/            # Types, action schemas, IPC
```

---

## Architecture highlights

- **Spotlight-first** app launch (`Cmd+Space` → app name → `Enter`)
- **In-app playbooks** for Spotify (`Cmd+K` search), Chrome URLs, YouTube playback seek
- **Strict verification** — search results alone ≠ success; playback/UI evidence required
- **No cloud APIs** — screenshots and inference stay on your machine
- **60s task timeout** with live iteration feed in the UI

---

## Status

🚧 **Work in progress** — core loop works; edge cases and demo polish ongoing.

Contributions, issues, and ideas welcome.

---

## License

MIT

---

<p align="center">
  Built with Cursor at the Cursor Buildathon · <a href="https://github.com/igoyalsamarth">Samarth Goyal</a>
</p>
