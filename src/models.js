// Model adapters for the agent runner: Anthropic (Claude) and any OpenAI-compatible API (OpenAI, xAI's Grok,
// local servers such as Ollama). The owner's API key is sent only to the provider, never to the model's context.
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

/**
 * Run a tool-using conversation until the model stops asking for tools (or maxRounds).
 * tools: [{ name, description, schema }]; execute(name, args) -> result object.
 * Returns { text, calls: [{ name, args, result }] }.
 */
export async function converse({ provider, baseUrl, model, apiKey, system, user, tools, execute, maxRounds = 8 }) {
  if (!apiKey && provider !== "ollama") throw new Error("set KFORGE_MODEL_KEY to the model provider's API key");
  const calls = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  if (provider === "anthropic") {
    const messages = [{ role: "user", content: user }];
    const spec = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
    if (spec.length) spec[spec.length - 1].cache_control = { type: "ephemeral" }; // tools + system are cached between cycles
    const sys = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
    for (let round = 0; round < maxRounds; round++) {
      const r = await post(ANTHROPIC, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, { model, max_tokens: 1500, system: sys, messages, tools: spec });
      usage.input += (r.usage?.input_tokens || 0) + (r.usage?.cache_creation_input_tokens || 0); usage.output += r.usage?.output_tokens || 0; usage.cacheRead += r.usage?.cache_read_input_tokens || 0;
      messages.push({ role: "assistant", content: r.content });
      const uses = r.content.filter((b) => b.type === "tool_use");
      if (!uses.length) return { text: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), calls, usage };
      const results = [];
      for (const u of uses) {
        const result = await safeRun(execute, u.name, u.input);
        calls.push({ name: u.name, args: u.input, result });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: results });
    }
    return { text: "(stopped: too many tool rounds this cycle)", calls, usage };
  }
  // OpenAI-compatible: OpenAI, xAI (https://api.x.ai/v1), Ollama (http://localhost:11434/v1), and others
  const url = `${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const spec = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));
  for (let round = 0; round < maxRounds; round++) {
    const r = await post(url, apiKey ? { authorization: `Bearer ${apiKey}` } : {}, { model, messages, tools: spec });
    usage.input += r.usage?.prompt_tokens || 0; usage.output += r.usage?.completion_tokens || 0;
    const m = r.choices[0].message;
    messages.push(m);
    if (!m.tool_calls?.length) return { text: m.content || "", calls, usage };
    for (const c of m.tool_calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch { args = {}; }
      const result = await safeRun(execute, c.function.name, args);
      calls.push({ name: c.function.name, args, result });
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return { text: "(stopped: too many tool rounds this cycle)", calls, usage };
}

async function safeRun(execute, name, args) {
  try { return await execute(name, args || {}); } catch (e) { return { refused: e.message }; }
}
async function post(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`model API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
