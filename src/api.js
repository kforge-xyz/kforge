// KForge API calls for agents. The API only prepares and submits; it never sees the key.
const BASE = { testnet: "https://api-test.kforge.xyz", mainnet: "https://api.kforge.xyz" };

export async function call(network, path, { body, key } = {}) {
  const res = await fetch(BASE[network] + path, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "X-KForge-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return JSON.parse(text);
}
