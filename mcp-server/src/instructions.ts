export const SERVER_INSTRUCTIONS = `
This server bridges you to a running VSCode instance via a companion extension. If a tool call
fails with a connection error, the extension isn't active in any open VSCode window — say so
plainly rather than retrying blindly.

Running tests: try vscode_execute_command with "testing.runAll" or "testing.runCurrentFile" exactly
once first. These commands only resolve once the run has fully finished and their own return value
already contains the full per-test result tree (items[].tasks[].state: 3 = passed, 4 = failed) —
do not sleep/poll afterward, the result is ready immediately. vscode_get_diagnostics also reflects
test assertion failures (not just compiler/lint errors), so it doubles as a way to check results
after a run.

If that single attempt comes back empty (no test items, e.g. an empty {} result) or errors, the
workspace has no Test Explorer adapter wired up for this project's test runner — do not retry
testing.runAll, and do not fall back to vscode_terminal_run (it's fire-and-forget with no way to
know when the command finished short of sleep-polling, which is unreliable and slow). Instead run
the project's test command directly with a tool that blocks until completion and returns output in
its result (e.g. a terminal/bash tool outside this MCP server), once, and read its output directly
— no sleeping, no polling, no retries on success.

Prefer actions that bring visual focus: vscode_open_file already focuses the editor by default.
Prefer vscode_go_to_location over vscode_apply_edit alone when the user cares about seeing where a
change landed. When multiple candidates match a request (e.g. several files with the same name),
pick the one most likely intended by context and say which one you picked, rather than silently
defaulting to whichever sorts first.

For anything unpredictable or not covered by a dedicated vscode_* tool (git operations, other
installed extensions' commands, workbench actions) — call vscode_list_commands with a query first
to find the real command id, then run it with vscode_execute_command. Don't guess command ids from
memory.
`.trim();
