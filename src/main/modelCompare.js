// Model A/B comparison.
//
// Sends the same prompt to two different models simultaneously and returns
// both responses for side-by-side comparison. This helps users pick the best
// model for their use case without manually switching back and forth.
//
// Uses the existing streamChat infrastructure — each model gets its own
// streamChat call running in parallel. The caller renders both responses
// side-by-side in the UI.

const { streamChat } = require('./lmstudio');
const settings = require('./settings');

/**
 * Send the same messages to two models in parallel and collect their responses.
 *
 * @param {Array} messages - OpenAI-style messages array
 * @param {string} modelA - First model id
 * @param {string} modelB - Second model id
 * @param {object} opts - { thinking, baseUrl, onChunkA, onChunkB }
 * @returns {Promise<{a: {text, thinking}, b: {text, thinking}}>}
 */
async function compareModels(messages, modelA, modelB, opts = {}) {
  const { thinking = true, baseUrl, onChunkA, onChunkB } = opts;
  const lmUrl = baseUrl || settings.get('lmStudioUrl') || 'http://127.0.0.1:1234';

  const runModel = async (model, onChunk) => {
    let text = '';
    let thinkingText = '';
    try {
      for await (const item of streamChat(messages, `compare-${model}-${Date.now()}`, model, thinking, lmUrl, {})) {
        if (item.type === 'text') {
          text += item.content;
          onChunk?.('text', item.content);
        } else if (item.type === 'thinking') {
          thinkingText += item.content;
          onChunk?.('thinking', item.content);
        }
      }
    } catch (e) {
      text = `Error: ${e.message}`;
    }
    return { text, thinking: thinkingText };
  };

  const [a, b] = await Promise.all([
    runModel(modelA, onChunkA),
    runModel(modelB, onChunkB),
  ]);

  return { a, b };
}

module.exports = { compareModels };
