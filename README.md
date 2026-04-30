<div align="center">

# ✦ Meg ✦

### Local-first AI desktop assistant for coding, projects, automations, and everyday work

[![Version](https://img.shields.io/badge/version-1.0.0--beta.6-7c3aed?style=for-the-badge&logo=electron&logoColor=white)](https://github.com/Natnael-15/Meg/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](#requirements)
[![Runtime](https://img.shields.io/badge/runtime-LM_Studio-ff6b35?style=for-the-badge)](#requirements)
[![License](https://img.shields.io/badge/license-MIT-111827?style=for-the-badge)](#license)

<br />

<a href="https://github.com/Natnael-15/Meg/releases/download/v1.0.0-beta.6/Meg-Setup-1.0.0-beta.6.exe">
  <img src="https://img.shields.io/badge/Download_Meg-v1.0.0--beta.6-3b6eff?style=for-the-badge&logo=windows&logoColor=white" height="48" alt="Download Meg for Windows" />
</a>

<br />
<br />

**Private by default. Workspace-aware. Tool-using. Skill-driven. Built for local models.**

</div>

---

## Overview

**Meg** is a local-first AI desktop assistant built with Electron, React, and LM Studio. It is designed to give a local model a proper working environment: project context, file access, terminal execution, tool permissions, background agents, automations, and domain-specific skill prompts.

Instead of treating the model like a plain chatbot, Meg wraps it in a desktop operating layer so it can help with real work across code, design, product, research, writing, debugging, planning, and automation.

> [!IMPORTANT]
> **v1.0.0-beta.6 — Skills System & AI Quality Overhaul**  
> Meg now includes a broad skill system with expert profiles across software, design, infrastructure, AI, product, research, and business domains. Skills can be selected manually or auto-detected from the user's message, then injected into the model context as structured guidance.

---

## What Meg Can Do

| Area | Capability |
| :--- | :--- |
| **Local AI Chat** | Streams responses from LM Studio with thinking support, abort controls, and tool call cards. |
| **Skills Engine** | Uses expert profiles such as Senior Web Developer, UI/UX Expert, Software Architect, DevOps Engineer, Research Analyst, Product Manager, and more. |
| **Auto Skill Detection** | Reads the user's request and activates the most relevant skill automatically. |
| **Workspace Awareness** | Keeps the active project visible and uses workspace context for file and tool operations. |
| **File Operations** | Reads, writes, creates, renames, deletes, and searches files through a permission-aware tool layer. |
| **Terminal Tools** | Runs commands, captures output, and feeds results back into the assistant workflow. |
| **Code Assistance** | Helps explain, debug, refactor, review, document, and improve code across full-stack projects. |
| **Agent Runs** | Supports multi-step background agent execution with run status and logs. |
| **Automations** | Runs structured workflows through a local automation runner and scheduler. |
| **Approval Queue** | Lets the user control sensitive actions with manual approvals or configurable bypass modes. |
| **Mobile Link** | Includes Telegram integration for mobile notifications and remote control workflows. |
| **Diagnostics** | Writes runtime diagnostics for startup, updater, renderer, and process-level failures. |

---

## Skills System

Meg's skill system is built around broad expert roles, not tiny single-purpose commands. The goal is to let the same local model answer with the mindset of the right specialist for the task.

| Category | Example Skills |
| :--- | :--- |
| **Languages** | Python, Node / API, TypeScript, React, Electron |
| **Frontend** | Web / UI, Senior Web Developer, Frontend Architect, Full-Stack Engineer |
| **Backend** | Backend Architect, API Designer, Database Designer |
| **Architecture** | Software Architect, Technical Lead, Systems Thinker |
| **Quality** | Testing Specialist, QA Engineer, Code Reviewer, Debugging Expert, Performance Engineer, Accessibility Expert |
| **Infrastructure** | DevOps Engineer, Git / GitHub Expert, Release Manager, Automation Engineer, PowerShell Expert |
| **AI & Data** | Data / ML Specialist, Data Analyst, AI Agent Builder, Prompt Engineer, Local AI Specialist |
| **Security** | Security Engineer |
| **Design** | UI/UX Designer, Product Designer, Design Systems Expert, Visual Designer, Motion Designer, Creative Director, Mobile UX Expert |
| **Documentation** | Documentation Writer, Technical Writer |
| **Product & Growth** | Product Manager, Startup Advisor, Business Strategist, Brand Strategist, Marketing Strategist, SEO Specialist, Copywriter, CRO Expert, App Launch Strategist |
| **Research** | Research Specialist, Research Analyst, Problem Solver |
| **Specialist** | Game Developer, Customer Experience Designer, Project Planner |

---

## beta.6 Highlights

- **Skill profiles** for broad expert roles across engineering, design, product, business, research, and AI.
- **Auto-detection** that chooses a skill from the user's message instead of requiring manual setup every time.
- **Improved model guidance** with stronger system prompts and concrete output standards.
- **Workspace switcher** in the chat header so the active project is always clear.
- **Workspace management** for creating, switching, and deleting workspaces from the UI.
- **Qwen thinking support** through `enable_thinking`, `reasoning_content`, and `<think>` parsing.
- **Tool permission improvements** so bypass and approval settings are respected consistently.
- **Streaming thinking pipeline** with separate thinking display and cleaner collapse behavior.

---

## Architecture

```text
Meg Desktop App
├─ Renderer UI
│  ├─ Chat surface
│  ├─ Skills selector
│  ├─ Workspace views
│  ├─ File browser
│  ├─ Split editor / terminal view
│  ├─ Agent dashboard
│  └─ Automation builder
│
├─ Electron Main Process
│  ├─ LM Studio client
│  ├─ Tool layer
│  ├─ Approval queue
│  ├─ Workspace service
│  ├─ Agent runner
│  ├─ Automation runner / scheduler
│  ├─ Settings and stores
│  └─ Diagnostics
│
└─ Local Model Runtime
   └─ LM Studio OpenAI-compatible server
```

Meg is intentionally local-first: the model runs through LM Studio, app data is handled on the user's machine, and tool execution is scoped through the desktop app rather than delegated blindly to the model.

---

## Requirements

- Windows 10 or Windows 11
- [LM Studio](https://lmstudio.ai/) running locally
- LM Studio local server available at:

```text
http://127.0.0.1:1234
```

Recommended local models:

- Qwen3-8B or similar Qwen coding/reasoning model
- DeepSeek-R1 distilled models
- Any OpenAI-compatible local model exposed by LM Studio

---

## Development

```bash
# Install dependencies
npm install

# Start the Vite + Electron dev environment
npm run dev

# Run tests
npm test

# Build the Windows installer
npm run build
```

Useful scripts are defined in `package.json`:

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite and Electron together. |
| `npm run renderer:dev` | Starts only the renderer dev server. |
| `npm run electron:dev` | Starts Electron with logging enabled. |
| `npm test` | Runs the Vitest test suite. |
| `npm run build` | Builds the renderer and packages the Windows app. |
| `npm run release` | Builds and publishes through electron-builder. |

---

## Project Status

Meg is in beta. The current focus is turning the app from a polished local AI shell into a reliable local AI operating layer: stronger workspace context, safer tools, better automation execution, cleaner diagnostics, and more capable skill-guided responses.

---

## License

MIT — see [`LICENSE`](LICENSE).

<div align="center">

Built by [Natnael-15](https://github.com/Natnael-15)

</div>
