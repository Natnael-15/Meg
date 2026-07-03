const { exec } = require('child_process');

function runGit(cmd, cwd) {
  return new Promise(resolve => {
    exec(`git ${cmd}`, { cwd, timeout: 5000 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : '',
        exitCode: err ? (err.code ?? 1) : 0,
      });
    });
  });
}

async function getStatus(cwd) {
  const branch = await runGit('rev-parse --abbrev-ref HEAD', cwd);
  const status = await runGit('status --porcelain', cwd);
  const ahead = await runGit('rev-list --count @{u}..HEAD', cwd);

  if (branch.exitCode !== 0) return null;

  const dirty = status.stdout ? status.stdout.split('\n').length : 0;

  return {
    branch: branch.stdout,
    dirty,
    ahead: ahead.exitCode === 0 ? parseInt(ahead.stdout) || 0 : 0
  };
}

async function getHeadSnapshot(cwd) {
  const branch = await runGit('rev-parse --abbrev-ref HEAD', cwd);
  const head = await runGit('rev-parse HEAD', cwd);
  const parents = await runGit('rev-list --parents -n 1 HEAD', cwd);

  if (branch.exitCode !== 0 || head.exitCode !== 0 || parents.exitCode !== 0) return null;

  const parentParts = parents.stdout.split(/\s+/).filter(Boolean);
  return {
    branch: branch.stdout,
    head: head.stdout,
    parentCount: Math.max(0, parentParts.length - 1),
  };
}

/**
 * Get a detailed status including per-file staging state.
 * Returns { branch, ahead, files: [{ path, status, staged }] }.
 */
async function getDetailedStatus(cwd) {
  const branchInfo = await getStatus(cwd);
  if (!branchInfo) return null;
  const status = await runGit('status --porcelain=v1', cwd);
  const files = [];
  if (status.stdout) {
    for (const line of status.stdout.split('\n')) {
      if (!line) continue;
      const x = line[0]; // index status
      const y = line[1]; // worktree status
      const path = line.slice(3);
      const staged = x !== ' ' && x !== '?';
      const statusLabel = staged ? x : (y !== ' ' ? y : x);
      files.push({ path, status: statusLabel, staged, raw: `${x}${y}` });
    }
  }
  return { ...branchInfo, files };
}

/**
 * Stage files for commit. Pass an array of paths, or ['.] for all.
 */
async function stage(cwd, paths = ['.']) {
  const args = paths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
  return runGit(`add ${args}`, cwd);
}

/**
 * Unstage files (git reset HEAD).
 */
async function unstage(cwd, paths = ['.']) {
  const args = paths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
  return runGit(`reset HEAD ${args}`, cwd);
}

/**
 * Create a commit with the given message.
 */
async function commit(cwd, message) {
  const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return runGit(`commit -m "${escaped}"`, cwd);
}

/**
 * Get the diff for a file (or all files if no path given).
 * If staged is true, shows the staged diff (git diff --cached).
 */
async function getDiff(cwd, path = null, staged = false) {
  const flag = staged ? '--cached' : '';
  const file = path ? `"${path.replace(/"/g, '\\"')}"` : '';
  return runGit(`diff ${flag} ${file}`.trim(), cwd);
}

/**
 * Get recent commit log (last N commits).
 * Returns array of { hash, author, date, message }.
 */
async function getLog(cwd, limit = 20) {
  const result = await runGit(
    `log --pretty=format:"%H|%an|%ad|%s" --date=iso -n ${limit}`,
    cwd
  );
  if (result.exitCode !== 0 || !result.stdout) return [];
  return result.stdout.split('\n').map(line => {
    const [hash, author, date, ...msgParts] = line.split('|');
    return { hash, author, date, message: msgParts.join('|') };
  });
}

/**
 * Get the list of branches.
 */
async function getBranches(cwd) {
  const result = await runGit('branch --format=%(refname:short)', cwd);
  if (result.exitCode !== 0) return [];
  return result.stdout.split('\n').filter(Boolean);
}

/**
 * Checkout a branch.
 */
async function checkout(cwd, branch) {
  return runGit(`checkout "${branch.replace(/"/g, '\\"')}"`, cwd);
}

module.exports = {
  getStatus,
  getHeadSnapshot,
  getDetailedStatus,
  stage,
  unstage,
  commit,
  getDiff,
  getLog,
  getBranches,
  checkout,
};
