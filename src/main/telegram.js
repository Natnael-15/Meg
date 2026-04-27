// Telegram Bot API client (uses Node 18+ built-in fetch)
// No npm package needed.

class TelegramBot {
  constructor(token) {
    this.token = token;
    this.base = `https://api.telegram.org/bot${token}`;
    this._offset = 0;
    this._polling = false;
    this._onMessage = null;
  }

  async _call(method, body = {}) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || 'Telegram API error');
    return json.result;
  }

  async getMe() {
    return this._call('getMe');
  }

  async sendMessage(chatId, text, extra = {}) {
    return this._call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  }

  async getUpdates() {
    const updates = await this._call('getUpdates', {
      offset: this._offset,
      timeout: 10,
      allowed_updates: ['message'],
    });
    if (updates.length) {
      this._offset = updates[updates.length - 1].update_id + 1;
    }
    return updates;
  }

  startPolling(onMessage) {
    if (this._polling) return;
    this._polling = true;
    this._onMessage = onMessage;
    this._poll();
  }

  stopPolling() {
    this._polling = false;
  }

  async _poll() {
    while (this._polling) {
      try {
        const updates = await this.getUpdates();
        for (const u of updates) {
          if (u.message && this._onMessage) {
            this._onMessage(u.message);
          }
        }
      } catch (e) {
        // Wait before retrying on error
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

let _bot = null;

function getBot(token) {
  if (!token) return null;
  if (!_bot || _bot.token !== token) {
    _bot = new TelegramBot(token);
  }
  return _bot;
}

async function validate(token) {
  try {
    const b = new TelegramBot(token);
    const me = await b.getMe();
    return { ok: true, username: me.username, name: me.first_name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getBot, validate };
