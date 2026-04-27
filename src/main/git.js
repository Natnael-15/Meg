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

module.exports = { getStatus };
