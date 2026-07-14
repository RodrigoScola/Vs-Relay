# Claude VSCode Bridge

## Running tests via the vscode-bridge MCP server

When asked to run tests in this repo through the `vscode-bridge` MCP tools, **always** use
`vscode_execute_command` with a VS Code testing command — never `vscode_terminal_run` (that
shells out to `vitest` directly instead of using the Test Explorer).

- Run everything: `vscode_execute_command` with `command: "testing.runAll"`
- Run just the currently open file's tests: `command: "testing.runCurrentFile"`

**Do not `sleep`/poll afterward.** These commands only resolve once the run has fully finished —
confirmed by testing: `testing.runCurrentFile`'s own return value already contains the complete
per-test result tree (`items[].tasks[].state`, where `3` = passed, `4` = failed), available
immediately in the tool response.

**`vscode_get_diagnostics` also reflects vitest failures**, not just tsc/eslint — confirmed by
testing: a failing `expect()` shows up as a diagnostic with the assertion message, file, and line.
It's a reliable and now human-readable (not raw JSON) way to check results after a run.

## Prefer actions that bring visual focus

Whenever a `vscode-bridge` action has a "focus" equivalent — opening a file, jumping to a
location, selecting a result — always do the version that actually brings it into view/focus in
the editor, rather than a passive/background variant, so the user can see what happened without
extra steps.

- `vscode_open_file` already focuses the editor by default (don't pass anything that would
  suppress that).
- After opening/creating a file, also reveal it in the Explorer tree with
  `vscode_execute_command` → `revealInExplorer` (or `workbench.files.action.showActiveFileInExplorer`
  for the currently active editor) so it's visible there too, not just as an editor tab.
- Prefer `vscode_go_to_location` over `vscode_apply_edit` alone when the user cares about seeing
  where a change landed — it opens the file and moves the cursor/selection there.
- When multiple candidates match a request (e.g. several files with the same name), pick the one
  most likely intended by context rather than defaulting to whichever happened to sort first, and
  say which one was opened.
