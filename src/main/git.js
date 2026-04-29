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

module.exports = { getStatus, getHeadSnapshot };
