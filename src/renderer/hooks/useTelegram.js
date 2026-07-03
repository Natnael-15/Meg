import { useState, useEffect, useCallback } from 'react';

/**
 * Telegram integration: token validation, message send/receive, connection
 * status, and the polling lifecycle.
 *
 * Owns:
 *  - `integrations.Telegram` flag (synced from token+chatId presence)
 *  - `tgStatus` validation state machine (null → 'checking' → {ok, username, name} | {ok:false, error})
 *  - `telegramToken` / `telegramChatId` (persisted via settings IPC)
 *  - `telegramMessages` log (persisted via the telegramState IPC collection)
 *  - `telegramSendError` for the SMS float UI
 *  - `sendTelegramMessage(text)` — optimistic append + IPC send + rollback on failure
 *  - `validateTg(token)` — 60-second polling flow to discover the chat id
 *    after the user sends any message to the bot
 *  - The `telegram:message` IPC listener for inbound messages
 *
 * Side effects on OTHER state slices (notifications, timeline events) are
 * delegated to the caller via `onIncomingMessage(msg)`.
 *
 * @param {object} opts
 * @param {(msg: object) => void} [opts.onIncomingMessage] - Fired for every inbound Telegram message (direction === 'inbound').
 * @returns {object} All telegram state + methods (see implementation).
 */
export function useTelegram({ onIncomingMessage } = {}) {
  const [integrations, setIntegrations] = useState({ Telegram: false, GitHub: false });
  const [tgStatus, setTgStatus] = useState(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [telegramSendError, setTelegramSendError] = useState(null);

  // Stable getters so async callbacks don't capture stale token/chatId.
  // These mirror the original ref-via-useCallback pattern in App.jsx.
  const getTelegramToken = useCallback(() => telegramToken, [telegramToken]);
  const getTelegramChatId = useCallback(() => telegramChatId, [telegramChatId]);

  const telegramConnected = Boolean(integrations.Telegram && getTelegramToken() && getTelegramChatId());
  const telegramContactName = tgStatus?.name || tgStatus?.username
    ? `Meg / ${tgStatus?.name || `@${tgStatus?.username}`}`
    : 'Meg';

  const appendTelegramMessage = useCallback((message) => {
    setTelegramMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const sendTelegramMessage = useCallback(async (text) => {
    const token = getTelegramToken();
    const chatId = getTelegramChatId();
    if (!token || !chatId || !window.electronAPI) {
      setTelegramSendError('Telegram is not connected yet.');
      return { ok: false, error: 'Telegram is not connected yet.' };
    }
    setTelegramSendError(null);
    const message = {
      id: `tg-out-${Date.now()}`,
      direction: 'outbound',
      from: 'Meg',
      text,
      chatId,
      createdAt: new Date().toISOString(),
      status: 'sent',
    };
    appendTelegramMessage(message);
    const result = await window.electronAPI.sendTelegram({ token, chatId, text });
    if (!result?.ok) {
      setTelegramSendError(result?.error || 'Failed to send Telegram message.');
      // Rollback the optimistic message to 'failed' status so the UI can
      // show a retry affordance.
      setTelegramMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, status: 'failed' } : item));
      return result;
    }
    return result;
  }, [appendTelegramMessage, getTelegramChatId, getTelegramToken]);

  // Token validation + chat-id discovery flow. Polls up to 60 times (1/sec)
  // for an inbound message from the user's Telegram account, then sends a
  // "Connection Established" confirmation message back.
  const validateTg = useCallback(async (token) => {
    if (!token.trim()) return;
    setTgStatus('checking');
    const r = await window.electronAPI?.validateTelegramToken(token);
    if (!r?.ok) { setTgStatus(r || { ok: false, error: 'Invalid token' }); return; }
    setTgStatus({ ok: true, username: r.username, waiting: true });

    let found = false;
    for (let i = 0; i < 60; i++) {
      const cr = await window.electronAPI?.findTelegramChatId(token);
      if (cr?.ok) {
        setTgStatus({ ok: true, username: r.username, name: cr.from });
        setIntegrations((s) => ({ ...s, Telegram: true }));
        setTelegramToken(token);
        setTelegramChatId(cr.chatId);
        window.electronAPI?.setSetting('telegramChatId', cr.chatId);
        window.electronAPI?.startTelegramPolling(token);
        await window.electronAPI?.sendTelegram({
          token, chatId: cr.chatId,
          text: '✦ Meg: Connection Established! ✦\nI am now linked to your local system.',
        });
        found = true; break;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    if (!found) setTgStatus({ ok: false, error: 'Timed out. Try again.' });
  }, []);

  // ── Initial load: fetch persisted token, chatId, and message log ──
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.listTelegramMessages().then((data) => {
      if (Array.isArray(data)) setTelegramMessages(data);
    });
    window.electronAPI.getSetting('telegramToken').then((value) => {
      if (typeof value === 'string') setTelegramToken(value);
    });
    window.electronAPI.getSetting('telegramChatId').then((value) => {
      if (typeof value === 'string') setTelegramChatId(value);
    });
  }, []);

  // ── Sync integrations.Telegram flag whenever token+chatId are both present ──
  useEffect(() => {
    if (telegramToken && telegramChatId) {
      setIntegrations((prev) => ({ ...prev, Telegram: true }));
    }
  }, [telegramToken, telegramChatId]);

  // ── Inbound message listener ──
  // Starts polling once we have a token, then forwards each inbound message
  // to the parent via onIncomingMessage (for notifications + timeline events).
  useEffect(() => {
    if (!window.electronAPI) return;
    const token = getTelegramToken();
    if (token) window.electronAPI.startTelegramPolling(token);
    window.electronAPI.onTelegramMessage((msg) => {
      const isOutbound = msg.direction === 'outbound';
      appendTelegramMessage({
        id: msg.id || `tg-${msg.direction || 'inbound'}-${msg.chatId || 'chat'}-${msg.date || Date.now()}-${msg.text || ''}`,
        direction: msg.direction || 'inbound',
        from: msg.from || (isOutbound ? 'Meg' : 'Telegram'),
        text: msg.text || '',
        chatId: msg.chatId || getTelegramChatId(),
        createdAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
        status: msg.status || (isOutbound ? 'sent' : 'received'),
      });
      if (!isOutbound) {
        setTelegramSendError(null);
        onIncomingMessage?.(msg);
      }
    });
    return () => window.electronAPI.removeListeners('telegram:message');
  }, [appendTelegramMessage, getTelegramChatId, getTelegramToken, onIncomingMessage]);

  return {
    integrations,
    setIntegrations,
    tgStatus,
    setTgStatus,
    telegramToken,
    setTelegramToken,
    telegramChatId,
    setTelegramChatId,
    telegramMessages,
    setTelegramMessages,
    telegramSendError,
    telegramConnected,
    telegramContactName,
    appendTelegramMessage,
    sendTelegramMessage,
    validateTg,
  };
}
