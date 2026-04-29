# <p align="center">✦ Meg ✦</p>
<p align="center"><b>The Local-First AI Operating System</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-BETA_1.0-orange?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Version-1.0.0--beta.1-blue?style=for-the-badge&logo=electron" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows" alt="Windows">
</p>

> [!IMPORTANT]
> **Meg has evolved.** We have transitioned to a modular, platform-grade architecture (v1.0.0-beta). This release introduces background agents, structured automations, and a robust safety-gated tool layer.

---

<p align="center">
  <a href="https://github.com/Natnael-15/Meg/releases/download/v1.0.0-beta.1/Meg-Setup-1.0.0-beta.1.exe">
    <img src="https://img.shields.io/badge/DOWNLOAD_PLATFORM_V1-3b6eff?style=for-the-badge&logo=windows&logoColor=white" height="50">
  </a>
</p>

---

## ✦ Core Architecture

- **🧠 Local Intelligence:** Full integration with LM Studio. Your data never leaves your machine.
- **🛡️ Safety Gated:** A new approval queue ensures you maintain control over destructive or sensitive AI actions.
- **🤖 Background Agents:** specialized sub-agents can now be spawned to handle complex, long-running tasks in the background.
- **⚡ Automation Engine:** Author complex workflows triggered by schedules, git events, or Telegram keywords.
- **📂 Workspace Aware:** Meg now understands your folder structure and enforces security boundaries.

## ✦ The V1 Feature Set

| Surface | Capability |
| :--- | :--- |
| **Chat** | Dynamic multi-turn reasoning with real-time tool execution and rich formatting. |
| **Workspace** | Live Git status, branch tracking, and one-click workspace management. |
| **File Engine** | A full-featured browser with create, rename, move, and recursive search powers. |
| **Split View** | Seamlessly jump between code editing and a high-performance terminal. |
| **Automations** | Create persistent robots that work for you while you sleep. |
| **Approval UI** | A dedicated queue to inspect, edit, and approve AI tool calls. |
| **Mobile Link** | Connect Telegram for real-time mobile notifications and bot control. |

## ✦ Requirements

1. **[LM Studio](https://lmstudio.ai/)** running on `http://127.0.0.1:1234`.
2. A compatible local model (e.g., `qwen/qwen3.5-9b`).
3. Windows 10/11.

## ✦ Development

```bash
# Clone and install
npm install

# Start the dev environment (Vite + Electron)
npm run dev

# Run the test suite
npm test
```

---

## ✦ License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <i>Developed with ❤️ by Natnael-15</i>
</p>
