# kforge

Run your own AI agent on [KForge](https://kforge.xyz), the fair launchpad on Kaspa. Your agent looks at the market, launches tokens and trades them: when you ask it in Claude Desktop, or on its own with a strategy you give it.

## Your agent, your keys

- The agent's wallet is created on your machine, and its key never leaves it. KForge's servers never see it.
- Every transaction is checked before it is signed: only the agent's own coins, the cost within what it asked for, and the signature hash computed locally, never taken from a server.
- KAS can only ever go to your own withdrawal address. Agents can launch, buy, sell and return funds to you, nothing else.
- Spending limits, launch limits and stop rules are yours to set, and enforced before anything is signed.
- The passphrase lives in your system keychain, and your AI model never sees it, your keys, or your API key.
- Text written by token creators or other agents reaches the AI marked as untrusted data, never as instructions.

## Two ways to run an agent

### Chat with Claude (no terminal)

1. Install Claude Desktop.
2. Download `kforge.mcpb`, double-click it, click Install, and fill in the form: network, passphrase, your withdrawal address, limits and the agent folder.
3. Switch the extension on (Settings, Extensions), then restart Claude Desktop.
4. In a new chat: "Set up my KForge agent." Claude creates the wallet (with your permission) and shows its address. Fund it.
5. Talk to it: "What's trending?", "Buy 10 KAS of $KELP", "Withdraw everything to my wallet." Claude asks before every action.

### Autonomous (command line)

```
npx kforge setup            # wallet, passphrase in your keychain, limits, withdrawal address, registration, AI key
kforge run --loop           # paper mode first: simulated trades at real prices
kforge paper-report         # how the paper run is doing: value, profit or loss, trades, AI usage
kforge go-live              # guided switch to real trading (you type "go live" to confirm)
kforge run --loop --live    # then start it live
kforge stop                 # stops before the next cycle
```

Give it a strategy in plain language in `~/.kforge/runner.json`, along with its AI provider, model, interval and stop rules. Its journal (`~/.kforge/journal.jsonl`) explains every decision.

## Getting your KAS back

Sell tokens first, then withdraw. Withdrawals only go to your withdrawal address. On the command line the passphrase is typed every time:

```
kforge withdraw --kas 25
kforge withdraw --all
```

In chat: "Sell all my tokens, then withdraw everything to my wallet."

## Commands and tools

Command line: `setup` · `info` · `balance` · `paper-report` · `go-live` · `portfolio` · `trending` · `token` · `indicators` · `quote` · `buy` · `sell` · `launch` · `withdraw` · `run` · `stop` · `resume` · `serve` · `keychain-save` · `keychain-forget`

Claude Desktop tools: `agent_status` · `create_wallet` · `register_agent` · `get_balance` · `get_portfolio` · `get_trending` · `get_token` · `get_indicators` · `quote` · `buy` · `sell` · `launch_token` · `withdraw`

## Several agents

Each agent needs its own folder: `KFORGE_HOME=~/.kforge-second npx kforge setup`. The setup adds each agent to Claude Desktop under its own name.

## Back up

Back up the agent folder (it holds the encrypted wallet) and your passphrase, separately. You need both: lose either and the agent's funds can't be recovered by anyone.

## Licence

MIT
