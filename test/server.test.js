// Starts the MCP server the way Claude Desktop does and calls its read-only tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "kforge-test", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/server.js"], env: { ...process.env } }));
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
for (const [name, args] of [["get_balance", {}], ["get_trending", { timeframe: "24h" }], ["quote", { token: process.argv[2], side: "buy", kas: 10 }]]) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  console.log(`${r.isError ? "ERROR" : "ok   "} ${name}: ${text.replace(/\s+/g, " ").slice(0, 140)}`);
}
await client.close();
