function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRecoveryHtml({
  title = 'Meg could not start',
  summary = 'The renderer failed to load.',
  details = [],
  diagnosticsPath = '',
} = {}) {
  const detailLines = (Array.isArray(details) ? details : [])
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f1115;
        --panel: #171a21;
        --border: #2b313d;
        --text: #eef2f7;
        --muted: #aab4c3;
        --accent: #6ea8fe;
        --error: #ff7b72;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .panel {
        width: min(720px, 100%);
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.2;
      }
      p {
        margin: 0 0 16px;
        color: var(--muted);
        line-height: 1.6;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255, 123, 114, 0.12);
        color: var(--error);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }
      ul {
        margin: 0 0 18px;
        padding-left: 18px;
        color: var(--text);
      }
      li { margin-bottom: 8px; line-height: 1.5; }
      code {
        font-family: "JetBrains Mono", Consolas, monospace;
        font-size: 12px;
        color: var(--text);
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 6px;
      }
      .footer {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <div class="status">Startup recovery</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(summary)}</p>
      ${detailLines ? `<ul>${detailLines}</ul>` : ''}
      <div class="footer">
        Diagnostics log: <code>${escapeHtml(diagnosticsPath || 'Unavailable')}</code>
      </div>
    </main>
  </body>
</html>`;
}

async function showRecoveryPage(win, options = {}) {
  const html = buildRecoveryHtml(options);
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  return win.loadURL(url);
}

module.exports = {
  buildRecoveryHtml,
  showRecoveryPage,
};
