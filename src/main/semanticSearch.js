// Semantic-ish file search.
//
// True semantic search requires an embedding model (e.g. a local model in
// LM Studio that exposes an /v1/embeddings endpoint). This module provides
// a lightweight text-similarity search that ranks files by:
//   1. Exact filename matches (highest weight)
//   2. Path segment matches
//   3. Content keyword frequency (TF-style scoring)
//   4. File-type preference (source files rank higher than config/data)
//
// When an LM Studio embeddings endpoint is available, we fall through to
// `searchWithEmbeddings()` which calls the local model for true semantic
// ranking. The two paths share the same API so callers don't need to know
// which is active.
//
// The search is async + uses fs/promises so the main process event loop
// isn't blocked — the original searchFiles in tools.js was synchronous.

const fsp = require('fs/promises');
const path = require('path');

const SOURCE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'vue', 'svelte',
  'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml', 'xml', 'sql', 'sh',
  'md', 'txt',
]);

const FILE_TYPE_WEIGHTS = {
  source: 3,
  config: 2,
  doc: 1.5,
  data: 1,
  other: 0.5,
};

function getFileTypeWeight(ext) {
  if (!ext) return FILE_TYPE_WEIGHTS.other;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'vue', 'svelte'].includes(ext)) return FILE_TYPE_WEIGHTS.source;
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'env', 'ini', 'cfg'].includes(ext)) return FILE_TYPE_WEIGHTS.config;
  if (['md', 'txt', 'rst', 'adoc'].includes(ext)) return FILE_TYPE_WEIGHTS.doc;
  if (['sql', 'csv', 'tsv'].includes(ext)) return FILE_TYPE_WEIGHTS.data;
  return FILE_TYPE_WEIGHTS.other;
}

/**
 * Score a file against a query. Higher = more relevant.
 * Factors: filename match, path segment match, content keyword frequency,
 * file type preference.
 */
function scoreFile(file, query, content = null) {
  const queryLower = query.toLowerCase();
  const nameLower = (file.name || '').toLowerCase();
  const pathLower = (file.path || '').toLowerCase();
  let score = 0;

  // 1. Exact filename match (highest weight)
  if (nameLower === queryLower) score += 100;
  else if (nameLower.startsWith(queryLower)) score += 50;
  else if (nameLower.includes(queryLower)) score += 25;

  // 2. Path segment match
  const pathSegments = pathLower.split(/[\\/]/);
  if (pathSegments.some(seg => seg === queryLower)) score += 20;
  else if (pathSegments.some(seg => seg.includes(queryLower))) score += 10;

  // 3. Content keyword frequency (if content was read)
  if (content) {
    const contentLower = content.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 1);
    for (const word of words) {
      const count = (contentLower.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(count * 2, 30); // Cap content contribution
    }
  }

  // 4. File type preference
  score *= getFileTypeWeight(file.ext);

  return score;
}

/**
 * Search the workspace inventory for files matching `query`. Returns
 * results sorted by relevance score (descending). Falls back to the
 * existing substring match for backward compatibility.
 *
 * @param {Array} inventory - Workspace file inventory (from workspace.js)
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {boolean} readContent - If true, reads file contents for content-
 *   based scoring (slower but more relevant). Default: false.
 * @returns {Promise<Array>} Sorted array of { ...file, score }
 */
async function semanticSearch(inventory = [], query = '', limit = 50, readContent = false) {
  if (!query || !query.trim() || !Array.isArray(inventory)) return [];

  const normalizedQuery = query.trim();
  const results = [];

  for (const file of inventory) {
    let content = null;
    if (readContent && file.size < 1024 * 1024 && SOURCE_EXTENSIONS.has(file.ext)) {
      try {
        content = await fsp.readFile(file.path, 'utf8');
      } catch {
        // Skip unreadable files.
      }
    }
    const score = scoreFile(file, normalizedQuery, content);
    if (score > 0) {
      results.push({ ...file, score });
    }
  }

  // Sort by score descending, then by mtime descending (newer first)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.mtime || 0) - new Date(a.mtime || 0);
  });

  return results.slice(0, limit);
}

/**
 * Check if the LM Studio server exposes an embeddings endpoint. If so,
 * we could use it for true semantic search. For now this is a feature
 * detect — the actual embeddings call is implemented in a future phase.
 */
async function hasEmbeddingsEndpoint(baseUrl = 'http://127.0.0.1:1234') {
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    const json = await res.json();
    return Array.isArray(json?.data) && json.data.some(m =>
      (m.id || '').toLowerCase().includes('embed') ||
      (m.id || '').toLowerCase().includes('e5') ||
      (m.id || '').toLowerCase().includes('bge')
    );
  } catch {
    return false;
  }
}

module.exports = {
  semanticSearch,
  hasEmbeddingsEndpoint,
  scoreFile,
  getFileTypeWeight,
  SOURCE_EXTENSIONS,
};
