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
 * Check if the LM Studio server exposes an embeddings endpoint.
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

// In-memory embedding cache: Map<text-hash, Float32Array>
// Prevents re-embedding the same file content on every search.
const embeddingCache = new Map();
const MAX_CACHE_ENTRIES = 500;

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

/**
 * Get the embedding for a text string via the LM Studio embeddings endpoint.
 * Uses the first available embedding model. Caches results in-memory.
 */
async function getEmbedding(text, baseUrl = 'http://127.0.0.1:1234') {
  const hash = hashText(text);
  if (embeddingCache.has(hash)) return embeddingCache.get(hash);

  try {
    // Find an embedding model
    const modelsRes = await fetch(`${baseUrl}/v1/models`);
    const modelsJson = await modelsRes.json();
    const embedModel = modelsJson?.data?.find(m =>
      (m.id || '').toLowerCase().includes('embed') ||
      (m.id || '').toLowerCase().includes('e5') ||
      (m.id || '').toLowerCase().includes('bge')
    );
    if (!embedModel) return null;

    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel.id, input: text.slice(0, 8000) }),
    });
    const json = await res.json();
    const embedding = json?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return null;

    const vec = new Float32Array(embedding);
    if (embeddingCache.size >= MAX_CACHE_ENTRIES) {
      // Evict oldest entry (Map preserves insertion order)
      const firstKey = embeddingCache.keys().next().value;
      embeddingCache.delete(firstKey);
    }
    embeddingCache.set(hash, vec);
    return vec;
  } catch {
    return null;
  }
}

/**
 * Cosine similarity between two Float32Array vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * True embeddings-based semantic search. If an embeddings model is available
 * in LM Studio, this function:
 *   1. Embeds the query
 *   2. Reads + embeds each file's content (capped at 8k chars per file)
 *   3. Ranks by cosine similarity
 *
 * Falls back to the scored search if no embeddings model is available.
 *
 * @param {Array} inventory - Workspace file inventory
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {string} baseUrl - LM Studio base URL
 * @returns {Promise<Array>} Sorted array of { ...file, score }
 */
async function embeddingsSearch(inventory = [], query = '', limit = 50, baseUrl = 'http://127.0.0.1:1234') {
  if (!query || !query.trim() || !Array.isArray(inventory)) return [];

  const hasEmbed = await hasEmbeddingsEndpoint(baseUrl);
  if (!hasEmbed) {
    // Fall back to scored search
    return semanticSearch(inventory, query, limit, true);
  }

  const queryEmbedding = await getEmbedding(query, baseUrl);
  if (!queryEmbedding) {
    return semanticSearch(inventory, query, limit, true);
  }

  const results = [];
  for (const file of inventory) {
    if (file.size > 1024 * 1024) continue;
    let content = '';
    try {
      content = await fsp.readFile(file.path, 'utf8');
    } catch { continue; }
    // Use first 8k chars for embedding (matching the API limit)
    const truncated = content.slice(0, 8000);
    const fileEmbedding = await getEmbedding(truncated, baseUrl);
    if (!fileEmbedding) continue;
    const similarity = cosineSimilarity(queryEmbedding, fileEmbedding);
    if (similarity > 0.1) { // Threshold to filter irrelevant results
      results.push({ ...file, score: similarity * 100 });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

module.exports = {
  semanticSearch,
  embeddingsSearch,
  hasEmbeddingsEndpoint,
  getEmbedding,
  cosineSimilarity,
  scoreFile,
  getFileTypeWeight,
  SOURCE_EXTENSIONS,
};
