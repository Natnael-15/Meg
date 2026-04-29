import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.jsx';

const createElectronApiMock = () => {
  const listeners = new Map();
  const register = (name) => vi.fn((cb) => {
    listeners.set(name, cb);
  });

  return {
  dbLoad: vi.fn(async (key) => []),
  dbSaveAll: vi.fn(async () => ({ ok: true })),
  getActiveWorkspace: vi.fn(async () => null),
  getModels: vi.fn(async () => []),
  getSetting: vi.fn(async (key) => {
    if (key === 'toolPermissions') return null;
    if (key === 'lastActiveThreadId') return null;
    if (key === 'onboardingCompleted') return true;
    if (key === 'splitOpen') return false;
    if (key === 'theme') return 'light';
    return null;
  }),
  getVersion: vi.fn(async () => '0.5.0'),
  listAgentRuns: vi.fn(async () => []),
  listApprovals: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => []),
  refreshWorkspaceMeta: vi.fn(async () => ({ ok: true, workspace: null })),
  searchWorkspaceFiles: vi.fn(async () => ({ ok: true, results: [], total: 0, truncated: false })),
  gitStatus: vi.fn(async () => ({ branch: 'main', dirty: 0, ahead: 0 })),
  onAgentChange: register('agent:change'),
  onApprovalChange: register('approval:change'),
  onUpdateAvailable: register('update:available'),
  onUpdateNotAvailable: register('update:not-available'),
  onUpdateProgress: register('update:progress'),
  onUpdateDownloaded: register('update:downloaded'),
  onUpdateError: register('update:error'),
  onTelegramMessage: register('telegram:message'),
  onChunk: register('chat:chunk'),
  onDone: register('chat:done'),
  onError: register('chat:error'),
  onToolCall: register('chat:tool_call'),
  onToolResult: register('chat:tool_result'),
  onResume: register('chat:resume'),
  ping: vi.fn(async () => ({ ok: true })),
  removeListeners: vi.fn((...names) => {
    names.forEach((name) => listeners.delete(name));
  }),
  sendChat: vi.fn(() => {}),
  setSetting: vi.fn(async () => ({ ok: true })),
  startTelegramPolling: vi.fn(async () => ({ ok: true })),
  sendTelegram: vi.fn(async () => ({ ok: true })),
  setActiveWorkspace: vi.fn(async () => ({ ok: true })),
  execCommand: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  openFile: vi.fn(async () => ({ canceled: false, filePaths: [] })),
  openFolder: vi.fn(async () => ({ canceled: false, filePaths: [] })),
  listDir: vi.fn(async () => []),
  upsertWorkspace: vi.fn(async (workspace) => ({ ok: true, workspace })),
  writeFile: vi.fn(async () => ({ ok: true })),
  renameFile: vi.fn(async () => ({ ok: true })),
  deleteFile: vi.fn(async () => ({ ok: true })),
  mkdir: vi.fn(async () => ({ ok: true })),
  readFile: vi.fn(async () => ({ content: '', error: null })),
  validateTelegramToken: vi.fn(async () => ({ ok: false })),
  findTelegramChatId: vi.fn(async () => ({ ok: false })),
  abortChat: vi.fn(async () => ({ ok: true })),
  approveToolCall: vi.fn(async () => ({ ok: true })),
  denyToolCall: vi.fn(async () => ({ ok: true })),
  checkForUpdates: vi.fn(async () => ({ ok: true })),
  createAgentRun: vi.fn(async () => ({ ok: true })),
  downloadUpdate: vi.fn(async () => ({ ok: true })),
  installUpdate: vi.fn(async () => ({ ok: true })),
  __emit: (name, payload) => {
    const cb = listeners.get(name);
    if (cb) cb(payload);
  },
  };
};

describe('App smoke flows', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('meg:onboarded', 'true');
    localStorage.setItem('meg:splitOpen', 'false');
    window.electronAPI = createElectronApiMock();
  });

  it('renders the default chat shell', async () => {
    render(<App />);

    expect(await screen.findByText('Chats')).toBeInTheDocument();
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask Meg anything/i)).toBeInTheDocument();
  });

  it('loads the persisted model from settings for chat execution', async () => {
    const user = userEvent.setup();
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'model') return 'gpt-4o';
      if (key === 'toolPermissions') return null;
      if (key === 'lastActiveThreadId') return null;
      if (key === 'onboardingCompleted') return true;
      if (key === 'splitOpen') return false;
      if (key === 'theme') return 'light';
      return null;
    });

    render(<App />);

    await user.type(await screen.findByPlaceholderText(/Ask Meg anything/i), 'use persisted model');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(window.electronAPI.sendChat).toHaveBeenCalled();
    });
    expect(window.electronAPI.sendChat.mock.calls[0][2]).toBe('gpt-4o');
  });

  it('shows explicit preview limits instead of fabricating backend chat when electronAPI is missing', async () => {
    const user = userEvent.setup();
    delete window.electronAPI;

    render(<App />);

    expect(await screen.findByText(/Preview mode only\./i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Ask Meg anything/i), 'hello from preview');
    await user.keyboard('{Enter}');

    expect((await screen.findAllByText('hello from preview')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Open Meg in the Electron desktop app/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Got it, working on that now/i)).not.toBeInTheDocument();
  });

  it('navigates to workspace and file browser views', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Workspace'));
    expect(await screen.findByText('Workspaces')).toBeInTheDocument();

    await user.click(screen.getByTitle('File Browser'));
    expect(await screen.findByText('Files')).toBeInTheDocument();
  });

  it('opens the split pane from chat', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('split'));

    await waitFor(() => {
      expect(screen.getByText('No file open')).toBeInTheDocument();
      expect(screen.getByText('Terminal')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Terminal'));
    expect(await screen.findByText('No terminal history')).toBeInTheDocument();
  });

  it('restores persisted split-pane state from settings', async () => {
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'toolPermissions') return null;
      if (key === 'lastActiveThreadId') return null;
      if (key === 'onboardingCompleted') return true;
      if (key === 'splitOpen') return true;
      if (key === 'theme') return 'light';
      return null;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('No file open')).toBeInTheDocument();
      expect(screen.getByText('Terminal')).toBeInTheDocument();
    });
  });

  it('opens notification and tray overlays', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Activity'));
    expect(await screen.findByText('Mark all read')).toBeInTheDocument();

    await user.click(screen.getByTitle('Tray'));
    expect(await screen.findByText('Open Meg')).toBeInTheDocument();
  });

  it('restores persisted notifications and saves read-state changes', async () => {
    const user = userEvent.setup();
    window.electronAPI.dbLoad.mockImplementation(async (key) => {
      if (key === 'notifications') {
        return [{
          id: 'notif-1',
          icon: 'sms',
          color: 'var(--accent)',
          title: 'Telegram from Alex',
          body: '"status update"',
          createdAt: '2026-04-29T09:00:00.000Z',
          read: false,
        }];
      }
      return [];
    });

    render(<App />);

    await user.click(screen.getByTitle('Activity'));
    expect(await screen.findByText('Telegram from Alex')).toBeInTheDocument();
    await user.click(screen.getByText('Mark all read'));

    await waitFor(() => {
      const saveCalls = window.electronAPI.dbSaveAll.mock.calls.filter(([table]) => table === 'notifications');
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestNotifs = saveCalls[saveCalls.length - 1][1];
      expect(latestNotifs[0]).toEqual(expect.objectContaining({ id: 'notif-1', read: true }));
    });
  });

  it('routes tray actions to chat and new task flows', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Workspace'));
    expect(await screen.findByText('Workspaces')).toBeInTheDocument();

    await user.click(screen.getByTitle('Tray'));
    await user.click(await screen.findByText('Open Meg'));
    expect(await screen.findByText('Chats')).toBeInTheDocument();

    await user.click(screen.getByTitle('Tray'));
    await user.click(await screen.findByText('New task'));
    expect((await screen.findAllByText('New chat')).length).toBeGreaterThan(0);
  });

  it('creates files directly from the file browser', async () => {
    const user = userEvent.setup();
    window.electronAPI.openFolder.mockResolvedValue({ canceled: false, filePaths: ['C:\\repo'] });
    window.electronAPI.listDir.mockResolvedValue([]);

    render(<App />);
    await user.click(screen.getByTitle('File Browser'));
    expect(await screen.findByText('No folder open')).toBeInTheDocument();

    await user.click(screen.getByText('Open folder'));
    expect(window.electronAPI.upsertWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'repo',
      path: 'C:\\repo',
    }));

    await user.click(screen.getByTitle('New file'));
    await user.type(await screen.findByPlaceholderText('notes.md'), 'notes.md');
    await user.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(window.electronAPI.writeFile).toHaveBeenCalledWith('C:\\repo\\notes.md', '');
    });
  });

  it('attaches selected files into the composer', async () => {
    const user = userEvent.setup();
    window.electronAPI.openFile.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\repo\\README.md', 'C:\\repo\\src\\App.jsx'],
    });

    render(<App />);
    await user.click(screen.getByTitle('Attach'));
    const composer = await screen.findByPlaceholderText(/Ask Meg anything/i);
    await waitFor(() => {
      expect(composer.value).toContain('@file(README.md)');
      expect(composer.value).toContain('@file(App.jsx)');
    });
  });

  it('surfaces approval events and approves from the tray', async () => {
    const user = userEvent.setup();
    const approval = {
      id: 'approval-1',
      status: 'pending',
      tool: 'run_command',
      args: { command: 'npm test' },
    };
    window.electronAPI.approveToolCall.mockResolvedValue({ approval: { ...approval, status: 'approved' } });

    render(<App />);
    await act(async () => {
      window.electronAPI.__emit('approval:change', { type: 'approval:created', approval });
    });

    expect(await screen.findByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getAllByText('npm test').length).toBeGreaterThan(0);

    await user.click(screen.getByText('Approve'));
    expect(window.electronAPI.approveToolCall).toHaveBeenCalledWith('approval-1');
  });

  it('denies approvals and clears the pending tray section', async () => {
    const user = userEvent.setup();
    const approval = {
      id: 'approval-2',
      status: 'pending',
      tool: 'write_file',
      args: { path: 'src/app.js' },
    };
    window.electronAPI.denyToolCall.mockResolvedValue({ approval: { ...approval, status: 'denied' } });

    render(<App />);
    await act(async () => {
      window.electronAPI.__emit('approval:change', { type: 'approval:created', approval });
    });

    expect(await screen.findByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getAllByText('src/app.js').length).toBeGreaterThan(0);

    await user.click(screen.getByText('Deny'));
    expect(window.electronAPI.denyToolCall).toHaveBeenCalledWith('approval-2');

    await waitFor(() => {
      expect(screen.queryByText('Pending Approval')).not.toBeInTheDocument();
    });
  });

  it('activates a real workspace path from the workspace view', async () => {
    const user = userEvent.setup();
    window.electronAPI.listWorkspaces.mockResolvedValue([
      { id: 'ws-real', name: 'Spec Workspace', path: 'C:\\spec-workspace' },
    ]);

    render(<App />);
    await user.click(screen.getByTitle('Workspace'));
    const workspaceLabels = await screen.findAllByText('Spec Workspace');
    expect(workspaceLabels.length).toBeGreaterThan(0);

    await user.click(workspaceLabels[0]);
    await waitFor(() => {
      expect(window.electronAPI.setActiveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
        id: 'ws-real',
        name: 'Spec Workspace',
        path: 'C:\\spec-workspace',
      }));
    });
  });

  it('opens the workspace terminal flow into chat split view', async () => {
    const user = userEvent.setup();
    window.electronAPI.listWorkspaces.mockResolvedValue([
      { id: 'ws-real', name: 'Spec Workspace', path: 'C:\\spec-workspace' },
    ]);
    render(<App />);

    await user.click(screen.getByTitle('Workspace'));
    expect((await screen.findAllByText('Spec Workspace')).length).toBeGreaterThan(0);

    await user.click(screen.getByText('Terminal'));

    await waitFor(() => {
      expect(screen.getByText('Chats')).toBeInTheDocument();
      expect(screen.getByText('No file open')).toBeInTheDocument();
      expect(screen.getByText('Terminal')).toBeInTheDocument();
    });
  });

  it('runs workspace quick actions and forwards command output into chat', async () => {
    const user = userEvent.setup();
    window.electronAPI.listWorkspaces.mockResolvedValue([
      { id: 'ws-real', name: 'Spec Workspace', path: 'C:\\spec-workspace' },
    ]);
    window.electronAPI.execCommand.mockResolvedValue({
      stdout: 'tests ok',
      stderr: '',
      exitCode: 0,
    });

    render(<App />);
    await user.click(screen.getByTitle('Workspace'));
    expect((await screen.findAllByText('Spec Workspace')).length).toBeGreaterThan(0);

    await user.click(screen.getByText('Run tests'));

    await waitFor(() => {
      expect(window.electronAPI.execCommand).toHaveBeenCalledWith('npm test', 'C:\\spec-workspace');
    });
    expect(window.electronAPI.sendChat).toHaveBeenCalled();
  });

  it('derives workspace files and linked chats from real app state', async () => {
    const user = userEvent.setup();
    window.electronAPI.listWorkspaces.mockResolvedValue([
      {
        id: 'ws-real',
        name: 'Spec Workspace',
        path: 'C:\\spec-workspace',
        files: 2,
        lang: 'TypeScript',
        inventory: [
          { name: 'package.json', ext: 'json', size: 400, mtime: '2026-04-29T09:00:00.000Z', path: 'C:\\spec-workspace\\package.json' },
          { name: 'app.tsx', ext: 'tsx', size: 1200, mtime: '2026-04-29T10:00:00.000Z', path: 'C:\\spec-workspace\\src\\app.tsx' },
        ],
      },
    ]);
    window.electronAPI.dbLoad.mockImplementation(async (key) => {
      if (key === 'threads') {
        return [{
          id: 'thread-ws-1',
          iconName: 'chat',
          title: 'Workspace thread',
          subtitle: 'linked to workspace',
          messages: [{ id: 1, role: 'meg', text: 'linked to workspace' }],
          workspaceId: 'ws-real',
          workspacePath: 'C:\\spec-workspace',
          createdAt: '2026-04-29T09:00:00.000Z',
          updatedAt: '2026-04-29T10:00:00.000Z',
        }];
      }
      return [];
    });

    render(<App />);
    await user.click(screen.getByTitle('Workspace'));
    expect((await screen.findAllByText('Spec Workspace')).length).toBeGreaterThan(0);
    expect(await screen.findByText('app.tsx')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();

    await user.click(screen.getAllByText('Threads')[1]);
    expect(await screen.findByText('Workspace thread')).toBeInTheDocument();
  });

  it('searches workspace files through the cached workspace search API', async () => {
    const user = userEvent.setup();
    window.electronAPI.listWorkspaces.mockResolvedValue([
      {
        id: 'ws-real',
        name: 'Spec Workspace',
        path: 'C:\\spec-workspace',
        files: 3,
        lang: 'TypeScript',
        inventory: [
          { name: 'package.json', ext: 'json', size: 400, mtime: '2026-04-29T09:00:00.000Z', path: 'C:\\spec-workspace\\package.json' },
          { name: 'app.tsx', ext: 'tsx', size: 1200, mtime: '2026-04-29T10:00:00.000Z', path: 'C:\\spec-workspace\\src\\app.tsx' },
          { name: 'worker.ts', ext: 'ts', size: 900, mtime: '2026-04-29T11:00:00.000Z', path: 'C:\\spec-workspace\\src\\worker.ts' },
        ],
      },
    ]);
    window.electronAPI.searchWorkspaceFiles.mockResolvedValue({
      ok: true,
      total: 1,
      truncated: false,
      results: [
        { name: 'worker.ts', ext: 'ts', size: 900, mtime: '2026-04-29T11:00:00.000Z', path: 'C:\\spec-workspace\\src\\worker.ts' },
      ],
    });

    render(<App />);
    await user.click(screen.getByTitle('Workspace'));
    await user.click((await screen.findAllByText('Files'))[1]);
    await user.type(screen.getByPlaceholderText('Search cached workspace files'), 'worker');

    await waitFor(() => {
      expect(window.electronAPI.searchWorkspaceFiles).toHaveBeenCalledWith('ws-real', 'worker', 100);
    });
    expect(await screen.findByText('worker.ts')).toBeInTheDocument();
    expect(screen.queryByText('app.tsx')).not.toBeInTheDocument();
  });

  it('restores the last active persisted thread on load', async () => {
    window.electronAPI.dbLoad.mockImplementation(async (key) => {
      if (key === 'threads') {
        return [
          {
            id: 'persisted-a',
            iconName: 'chat',
            title: 'Persisted A',
            subtitle: 'older',
            time: '1m',
            unread: false,
            messages: [{ id: 1, role: 'meg', text: 'inactive thread body' }],
            files: [],
            tools: {},
            memory: '',
          },
          {
            id: 'persisted-b',
            iconName: 'chat',
            title: 'Persisted B',
            subtitle: 'active',
            time: 'now',
            unread: false,
            messages: [{ id: 2, role: 'meg', text: 'restored active thread body' }],
            files: [],
            tools: {},
            memory: '',
          },
        ];
      }
      return [];
    });
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'lastActiveThreadId') return 'persisted-b';
      if (key === 'toolPermissions') return null;
      return null;
    });

    render(<App />);

    expect((await screen.findAllByText('restored active thread body')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Persisted B').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(window.electronAPI.setSetting).toHaveBeenCalledWith('lastActiveThreadId', 'persisted-b');
    });
  });

  it('renders streamed chat chunks and tool results', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByPlaceholderText(/Ask Meg anything/i);
    await user.type(input, 'Check status{enter}');

    expect(window.electronAPI.sendChat).toHaveBeenCalled();
    const threadId = window.electronAPI.sendChat.mock.calls[0][1];

    await act(async () => {
      window.electronAPI.__emit('chat:chunk', { threadId, chunk: 'Working on it' });
    });
    expect((await screen.findAllByText('Working on it')).length).toBeGreaterThan(0);

    await act(async () => {
      window.electronAPI.__emit('chat:tool_call', { threadId, id: '1', name: 'run_command', args: { command: 'npm test' } });
    });
    expect(await screen.findByText('Running command')).toBeInTheDocument();

    await act(async () => {
      window.electronAPI.__emit('chat:tool_result', { threadId, id: '1', result: { ok: true, stdout: 'done' } });
      window.electronAPI.__emit('chat:done', { threadId });
    });

    await user.click(screen.getByText('Running command'));
    await waitFor(() => {
      expect(
        screen.getAllByText((_, element) => element?.textContent?.includes('"stdout": "done"')).length,
      ).toBeGreaterThan(0);
    });
  });

  it('shows live backend agent updates in the agent dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await act(async () => {
      window.electronAPI.__emit('agent:change', {
        run: {
          id: 'run-1',
          name: 'backend-review',
          status: 'running',
          parentThreadId: 'thread-1',
          model: 'gpt-4o',
          createdAt: '2026-04-28T12:00:00.000Z',
          steps: [
            { label: 'Inspect files', status: 'done' },
            { label: 'Summarize risks', status: 'active' },
          ],
          logs: [{ level: 'info', message: 'inspecting auth middleware' }],
        },
      });
    });

    await user.click(screen.getByTitle('Agents'));

    expect((await screen.findAllByText('backend-review')).length).toBeGreaterThan(0);
    expect(screen.getByText('Inspect files')).toBeInTheDocument();
    expect(screen.getByText('Summarize risks')).toBeInTheDocument();
  });

  it('handles chat resume and error events', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByPlaceholderText(/Ask Meg anything/i);
    await user.type(input, 'Retry task{enter}');
    expect(window.electronAPI.sendChat).toHaveBeenCalled();
    const threadId = window.electronAPI.sendChat.mock.calls[0][1];

    await act(async () => {
      window.electronAPI.__emit('chat:resume', { threadId });
      window.electronAPI.__emit('chat:chunk', { threadId, chunk: 'Retrying now' });
    });
    expect((await screen.findAllByText('Retrying now')).length).toBeGreaterThan(0);

    await act(async () => {
      window.electronAPI.__emit('chat:error', { threadId, error: 'backend offline' });
    });

    await waitFor(() => {
      expect(screen.getAllByText('Error: backend offline').length).toBeGreaterThan(0);
    });
  });

  it('drives update actions from update lifecycle events', async () => {
    const user = userEvent.setup();
    render(<App />);

    await act(async () => {
      window.electronAPI.__emit('update:available', { version: '0.6.0' });
    });

    expect(await screen.findByText('Update')).toBeInTheDocument();
    await user.click(screen.getByText('Update'));
    await user.click(screen.getByText('Download Now'));
    expect(window.electronAPI.downloadUpdate).toHaveBeenCalled();

    await act(async () => {
      window.electronAPI.__emit('update:progress', { percent: 42 });
    });
    expect(await screen.findByText('42%')).toBeInTheDocument();

    await act(async () => {
      window.electronAPI.__emit('update:downloaded', {});
    });
    expect(await screen.findByText('Ready')).toBeInTheDocument();

    await user.click(screen.getByText('Ready'));
    await user.click(screen.getByText('Restart & Install'));
    expect(window.electronAPI.installUpdate).toHaveBeenCalled();
  });

  it('persists theme changes through the settings store', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Settings'));
    await user.click(await screen.findByText('Appearance'));
    await user.click(await screen.findByText('Dark'));

    await waitFor(() => {
      expect(window.electronAPI.setSetting).toHaveBeenCalledWith('theme', 'dark');
    });
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('persists appearance tweaks through the renderer settings record', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Settings'));
    await user.click(await screen.findByText('Appearance'));
    await user.click(await screen.findByText('Warm'));
    await user.click(await screen.findByText('Compact'));

    await waitFor(() => {
      expect(window.electronAPI.setSetting).toHaveBeenCalledWith(
        'rendererTweaks',
        expect.objectContaining({ accentColor: 'warm', sidebarWidth: 'compact' }),
      );
    });
  });

  it('renders persisted Telegram messages in the mobile view without demo boot data', async () => {
    window.electronAPI.dbLoad.mockImplementation(async (key) => {
      if (key === 'telegramMessages') {
        return [
          {
            id: 'tg-1',
            direction: 'inbound',
            from: 'Nat',
            text: 'Deployment is green',
            chatId: '42',
            createdAt: '2026-04-29T05:00:00.000Z',
            status: 'received',
          },
        ];
      }
      return [];
    });
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'telegramToken') return 'token';
      if (key === 'telegramChatId') return '42';
      if (key === 'toolPermissions') return null;
      if (key === 'lastActiveThreadId') return null;
      return null;
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Telegram'));
    expect(await screen.findByText('Deployment is green')).toBeInTheDocument();
    expect(screen.queryByText('Connect Telegram and start a conversation to see messages here.')).not.toBeInTheDocument();
  });

  it('shows an honest empty Telegram overlay instead of canned demo messages', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('SMS'));
    expect(await screen.findByText('Connect Telegram in Settings to start replying from here.')).toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });

  it('injects persisted memories from settings into chat requests', async () => {
    const user = userEvent.setup();
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'model') return 'gpt-4o';
      if (key === 'memoryEnabled') return true;
      if (key === 'memories') return ['Prefers concise answers', 'Working on Meg'];
      if (key === 'toolPermissions') return null;
      if (key === 'lastActiveThreadId') return null;
      return null;
    });

    render(<App />);

    await user.type(await screen.findByPlaceholderText(/Ask Meg anything/i), 'use memory');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(window.electronAPI.sendChat).toHaveBeenCalled();
    });
    expect(window.electronAPI.sendChat.mock.calls[0][0][0].content).toContain('Prefers concise answers');
    expect(window.electronAPI.sendChat.mock.calls[0][0][0].content).toContain('Working on Meg');
  });

  it('shows an honest empty quick-capture state instead of canned suggestions', async () => {
    render(<App />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, shiftKey: true }));

    expect(await screen.findByText('No recent captures yet.')).toBeInTheDocument();
    expect(screen.queryByText('Run the test suite')).not.toBeInTheDocument();
  });

  it('shows real update state copy in settings instead of a generic up-to-date claim', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Settings'));
    await user.click(await screen.findByText('Updates'));
    expect(await screen.findByText('No update check has run in this session.')).toBeInTheDocument();

    await act(async () => {
      window.electronAPI.__emit('update:available', { version: '0.6.0' });
    });
    expect(await screen.findByText('Version 0.6.0 is available to download.')).toBeInTheDocument();
  });

  it('routes onboarding setup work into settings instead of fake permission toggles', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('meg:onboarded');
    window.electronAPI.getSetting.mockImplementation(async (key) => {
      if (key === 'toolPermissions') return null;
      if (key === 'lastActiveThreadId') return null;
      if (key === 'onboardingCompleted') return false;
      if (key === 'splitOpen') return false;
      if (key === 'theme') return 'light';
      return null;
    });
    render(<App />);

    expect(await screen.findByText('Meet Meg')).toBeInTheDocument();
    await user.click(screen.getByText('Continue →'));
    await user.click(screen.getByText('Continue →'));

    expect(await screen.findByText('Complete setup in Settings')).toBeInTheDocument();
    expect(screen.getByText('Open Settings')).toBeInTheDocument();

    await user.click(screen.getByText('Open Settings'));
    expect(await screen.findByText('Settings')).toBeInTheDocument();
  });

  it('persists context-panel tool toggles into thread state', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByPlaceholderText(/Ask Meg anything/i), 'Check tools{enter}');
    const threadId = window.electronAPI.sendChat.mock.calls[0][1];
    await act(async () => {
      window.electronAPI.__emit('chat:done', { threadId });
    });
    expect(await screen.findByText('File system')).toBeInTheDocument();

    const fileSystemLabel = screen.getByText('File system');
    const toggleButton = fileSystemLabel.parentElement?.querySelector('button');
    expect(toggleButton).toBeTruthy();

    await user.click(toggleButton);
    await waitFor(() => {
      const saveCalls = window.electronAPI.dbSaveAll.mock.calls.filter(([table]) => table === 'threads');
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestThreads = saveCalls[saveCalls.length - 1][1];
      expect(latestThreads[0].tools['File system']).toBe(true);
    });
  });
});
