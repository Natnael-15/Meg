// Myers diff implementation for the SplitPane diff view.
//
// The previous implementation in overlays.jsx was a naive line-by-line
// comparison: it walked both texts in lockstep and emitted a remove+add pair
// for every differing line. That produces noisy diffs where a single inserted
// line at the top of a file makes every subsequent line look "changed".
//
// Myers' algorithm finds the *shortest edit script* — the minimum set of
// insertions and deletions that transform `a` into `b`. The result is a
// diff that humans actually recognize as "what changed".
//
// Implementation note: this is the O(ND) middle-snake variant simplified to
// just compute the edit script (no recursion into the two halves). For the
// file sizes Meg deals with (source files, config, markdown) the input is
// small enough that the simpler O((N+M)*D) dynamic-programming approach is
// fine and far easier to reason about. We use the DP table approach.

/**
 * Compute a line-level diff between two strings.
 *
 * @param {string} originalText
 * @param {string} nextText
 * @returns {Array<{type: 'context'|'add'|'remove', text: string, line: number}>}
 *   - `context`: line present in both (unchanged)
 *   - `remove`:  line present only in original (deleted)
 *   - `add`:     line present only in next (inserted)
 *   - `line`:    1-indexed line number in the *next* text (for adds/context)
 *                or in the *original* text (for removes). Used by the UI to
 *                show line numbers in the gutter.
 */
export function diffLines(originalText = '', nextText = '') {
  const a = String(originalText).split('\n');
  const b = String(nextText).split('\n');
  const n = a.length;
  const m = b.length;

  // DP table: dp[i][j] = length of the shortest edit script between
  // a[0..i) and b[0..j).
  // We only need the previous row to compute the current one, so we could
  // roll it into two arrays — but for clarity (and because file diffs are
  // small) we keep the full table so we can backtrack to recover the path.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  // Backtrack from dp[n][m] to dp[0][0] to recover the edit script.
  // We build it in reverse, then flip it at the end.
  const reversed = [];
  let i = n;
  let j = m;
  let nextLine = m;  // 1-indexed line in `b` for context/add rows
  let origLine = n;  // 1-indexed line in `a` for remove rows

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      // Context line — present in both
      reversed.push({ type: 'context', text: a[i - 1], line: j });
      i--; j--;
      nextLine = j;
      origLine = i;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] <= dp[i - 1][j])) {
      // Insertion in `b`
      reversed.push({ type: 'add', text: b[j - 1], line: j });
      j--;
    } else {
      // Deletion from `a`
      reversed.push({ type: 'remove', text: a[i - 1], line: i });
      i--;
    }
  }

  return reversed.reverse();
}
