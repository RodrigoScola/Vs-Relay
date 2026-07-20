# VS Relay

## Where user-facing tool guidance lives

Guidance on *how to use* the `vs-relay` MCP tools (testing workflow, preferring
focus-bringing actions, command discovery) lives in
[`mcp-server/src/instructions.ts`](mcp-server/src/instructions.ts) — it's sent to every MCP client
as the server's `instructions` field during the `initialize` handshake (see the MCP spec /
`ServerOptions.instructions`). That reaches **everyone who uses the built extension**, in any
project, on any machine — not just sessions that happen to have this repo open. This file
(`CLAUDE.md`) only reaches Claude Code sessions working *on this repo's source*, which is a much
narrower audience, so don't put end-user tool guidance here — put it in `instructions.ts` and
update `mcp-server/src/instructions.test.ts` alongside it.

## Working on this repo

- All three packages (`shared`, `extension`, `mcp-server`) build under a shared strict
  `tsconfig.base.json` and lint clean under `eslint.config.mjs`'s type-checked strict rule sets —
  keep new code passing both (`npm run build`, `npx eslint .`).
- `test-workspace/` is a manual-testing fixture opened by the "Run Extension" launch config; it's
  excluded from lint/type-checking on purpose.
- Run `npm test` (vitest, across all three packages) before considering a change done. This
  workspace has no VSCode Test Explorer adapter wired up for vitest, so don't try
  `testing.runAll` via vs-relay first — it's a known no-op here and running it plus `npm test`
  counts as running the tests twice. Go straight to `npm test`.
