<p align="center">
  <img src="src/renderer/assets/logo.svg" width="52" height="52" alt="Meg">
</p>
<h1 align="center">Meg</h1>
<p align="center"><b>Local-First AI Desktop Assistant</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0--beta.6-blueviolet?style=for-the-badge&logo=electron" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows" alt="Windows">
  <img src="https://img.shields.io/badge/Model-LM_Studio-ff6b35?style=for-the-badge" alt="LM Studio">
</p>

> [!IMPORTANT]
> **v1.0.0-beta.6 — Skills System & AI Quality Overhaul.** Meg now carries 55 expert skill profiles across 13 domains. She auto-detects the right skill from your message and injects it as a structured system prompt — so whether you are asking about a Python script, a marketing plan, or a database schema, she answers as a domain expert, not a generalist.

---

<p align="center">
  <a href="https://github.com/Natnael-15/Meg/releases/download/v1.0.0-beta.6/Meg-Setup-1.0.0-beta.6.exe">
    <img src="https://img.shields.io/badge/DOWNLOAD_v1.0.0--beta.6-3b6eff?style=for-the-badge&logo=windows&logoColor=white" height="50">
  </a>
</p>

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Lightbulb/SVG/ic_fluent_lightbulb_24_regular.svg" width="20"> What's New in beta.6

| Area | Change |
| :--- | :--- |
| **Skills System** | 55 expert skill profiles across 13 categories. Select manually or let Meg auto-detect from your message. |
| **Auto-Detection** | Meg reads your message and activates the best-matching skill automatically — Python, DevOps, SEO, Game Dev, and more. |
| **Skill Categories** | Language, Frontend, Backend, Architecture, Quality, Infra, AI & Data, Security, Design, Docs, Product, Research, Specialist. |
| **Workspace Switcher** | Switch active workspace directly from the chat header without leaving the conversation. |
| **Workspace Management** | Delete workspaces from the UI. Active workspace badge shown at all times. |
| **Think Toggle** | Fixed. Qwen3 now correctly enables and disables thinking mode via `enable_thinking`. |
| **Tool Permissions** | Bypass mode now respected end-to-end. Permission settings apply correctly. |
| **Output Quality** | Overhauled system prompt with concrete output standards and domain-expert skill injection. |
| **Thinking Pipeline** | Native `reasoning_content` and `<think>` tags both handled. Thinking streams separately and collapses when done. |

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Architecture/SVG/ic_fluent_architecture_24_regular.svg" width="20"> Core Architecture

- **Local by default.** Meg runs entirely on your machine via LM Studio. No cloud, no subscriptions, no data leaving your device.
- **Skills engine.** On every message, the active skill's prompt is injected as a structured system message before your conversation history — giving the model expert-level context for the domain at hand.
- **Tool access.** Meg can read and write files, run shell commands, search the web, manage workspaces, and more — all with a configurable approval queue.
- **Workspace scoped.** All autonomous actions are resolved relative to your active project folder.
- **Streaming.** Responses stream token by token with live thinking display, tool call cards, and a proper abort control.

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Apps/SVG/ic_fluent_apps_24_regular.svg" width="20"> Skills

Meg ships with 55 skills. Select one from the toolbar or leave it on auto-detect.

| Category | Skills |
| :--- | :--- |
| **Language** | Python, Node / API, TypeScript, React, Electron |
| **Frontend** | Web / UI, Senior Web Dev, Frontend Arch, Full-Stack |
| **Backend** | Backend Arch, API Design, Database |
| **Architecture** | Software Architect, Tech Lead, Systems Thinker |
| **Quality** | Testing, QA Engineer, Code Review, Debugging, Performance, A11y |
| **Infra** | DevOps, Git / GitHub, Release Manager, Automation, PowerShell |
| **AI & Data** | Data / ML, Data Analyst, AI Agent Builder, Prompt Engineer, Local AI |
| **Security** | Security Engineer |
| **Design** | UX/UI, Product Design, Design System, Visual Design, Motion, Creative Director, Mobile UX |
| **Docs** | Documentation Writer, Technical Writer |
| **Product** | Product Manager, Startup Advisor, Business Strategy, Brand Strategy, Marketing, SEO, Copywriter, CRO, App Launch |
| **Research** | Research, Research Analyst, Problem Solver |
| **Specialist** | Game Dev, CX Designer, Project Planner |

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Feature/SVG/ic_fluent_feature_search_24_regular.svg" width="20"> Full Feature Set

| Surface | Capability |
| :--- | :--- |
| **Chat** | Streaming responses, thinking display, tool call cards, auto-scroll, abort control |
| **Skills** | 55 expert domains, auto-detected or manually selected per conversation |
| **Workspaces** | Create, switch, and delete project workspaces with active context shown in the chat header |
| **File Browser** | Full-featured browser with create, rename, move, and recursive search |
| **Split View** | Side-by-side code editor and terminal |
| **Automations** | Persistent background workflows that run on a schedule |
| **Agent Dashboard** | Monitor and manage multi-step background agent runs with logs |
| **Mobile Link** | Telegram integration for remote control and notifications |
| **Tool Permissions** | Configurable approval queue — bypass, auto-approve, or manual per tool |

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Settings/SVG/ic_fluent_settings_24_regular.svg" width="20"> Setup

**Requirements:**

1. [LM Studio](https://lmstudio.ai/) running on `http://127.0.0.1:1234`
2. Any OpenAI-compatible local model — `Qwen3-8B` and `DeepSeek-R1` recommended
3. Windows 10 or 11

Meg auto-detects whichever model is active in LM Studio on launch. No config needed.

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/Developer/SVG/ic_fluent_developer_board_24_regular.svg" width="20"> Development

```bash
# Install dependencies
npm install

# Start dev environment (Vite + Electron)
npm run dev

# Run tests
npm test

# Build installer
npm run build
```

---

## <img src="https://raw.githubusercontent.com/microsoft/fluentui-system-icons/master/assets/License/SVG/ic_fluent_certificate_24_regular.svg" width="20"> License

MIT — see `LICENSE`.

<p align="center">
  <sub>Developed by <a href="https://github.com/Natnael-15">Natnael-15</a></sub>
</p>
