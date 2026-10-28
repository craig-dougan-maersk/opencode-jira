# opencode-jira

Jira boards, active sprints, backlog, epics, issue relationships and multiline
comments inside the OpenCode V2 terminal. This TUI-only plugin talks directly to
Jira REST and Agile APIs, including when connected to a remote OpenCode server.

## Install

Add a reviewed full Git commit to `plugins` in global
`~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`):

```jsonc
{
  "plugins": [
    "git+https://github.com/craig-dougan-maersk/opencode-jira.git#<full-reviewed-commit>",
  ],
}
```

For local development, use the absolute repository directory instead.
`./tui` exports committed `dist/tui.js`. Consumers do not need a TSX loader or
compiler, and no install/prepare/prepack/build hooks run. Solid and OpenTUI are
external imports supplied by the host: do not bundle a second copy. Tested
against OpenCode V2 2.2.0 declarations and OpenTUI 0.7.0; the offline baseline
also covers OpenTUI 0.6.6. Actual installed-host loading and full host keymap
acceptance remain separate from offline tests.

Official references: [plugins](https://opencode.ai/v2/docs/build/plugins),
[TUI plugins](https://opencode.ai/v2/docs/build/plugins/cli),
[CLI](https://opencode.ai/v2/docs/cli).

## Credentials and settings

Export `JIRA_EMAIL` and `JIRA_API_TOKEN` using your own account and Atlassian API
token. Never put them in this repository or plugin settings. Environment
variables take priority; the existing fallback parses those two names from
`~/.zshenv`, `~/.zprofile`, `~/.zshrc`, then `~/.env` without executing a shell.

Run **Jira: settings** in the palette to replace the placeholder
`example.atlassian.net` site and `DEMO` project with your board. Settings persist
in the plugin store: `site`, `projectKey`, `boardId`, `cacheSeconds`, `linkDepth`.
Custom field IDs are site-specific. Review and edit `lib/fields.ts` for your
site before using legacy epic fields. Recompile after editing source.

## Use

`/jira` opens your workspace; `/jira DEMO-123` opens a ticket directly.
Keys `1`–`4` select My Work, Sprint, Backlog and Epics. `j`/`k` or arrows select
rows; Enter opens tickets, `g` shows dependencies, `o` opens a browser and `y`
copies the key. `a`, `t`, `/` filter assignee, type and text; `r` refreshes.

`m` changes status, `i` assigns to you, `u` unassigns, and `s` adds to the active
sprint. These actions make real Jira writes when you invoke them.
`c` opens a multiline comment. Enter and pasted newlines edit only; an explicit
Submit click or Enter with Submit focused sends. Cancel/Escape retains drafts
in memory; pending submission locks exit and duplicate sends. Comment POSTs
are never retried. After uncertain delivery, check Jira before resubmitting.

Tab/Shift+Tab move focus. Escape/q/Backspace pop nested screens; at the root,
they return to the captured OpenCode session or route. The visible **Close to
session** control (**Close** on narrow terminals) does the same, or **Back** on
nested screens. Host dialogs close first; editing Escape cancels the composer.
The session route is snapshotted before navigating, preserving reactive-proxy
compatibility. The settings proxy/accessor guard is also retained.

## Develop and verify

Use Node 26.12.1 and npm 11.6.2 (the exact CI/test toolchain). The supported
package engine is Node >=26.12.1. Locked OpenTUI 0.7.0 needs Node >=26.4.0 for
native FFI; Node 22 is not supported for the complete test suite. Compiling
JavaScript alone on an older runtime does not establish native/host support.
Source remains editable in `tui.tsx`, `lib/`,
and `ui/`; package contents include only the compiled entry and documentation.

```sh
npm ci --ignore-scripts
npm run compile
npm test
```

Compile explicitly and commit `dist/tui.js` with source changes. `check:dist`
regenerates in memory and rejects stale output. Do not add `build`, `prepare`,
`prepack`, install hooks or workspaces: npm treats these as Git dependency
preparation triggers even when an artifact is already present.

Packaging tests parse the compiled JavaScript, inspect real tarball contents,
and use actual npm Git installation from a temporary signed committed repo,
with scripts disabled and enabled. Git fixtures use ephemeral SSH signing keys
and require `git` and `ssh-keygen`. Set `GIT_PACKAGE_SPEC` to a reviewed remote feature commit to repeat
the same installed-artifact checks after pushing. No consumer compilation is
performed. Positive temporary fixtures contain only public package files.
An inherited Node preload observes lifecycle events in actual npm Git installs
and rejects preparation. A signed negative-control package deliberately runs
`prepare`; its event and installed marker must be detected by the same guard.
This does not rely on `npm_execpath`, which npm can replace internally.

All 69 inherited behavior tests are offline (14 pure/client, 36 mounted,
19 native), with synthetic `example.invalid` fixtures and mocked Jira. They
cover session return, history, focus, modal isolation, draft preservation,
pending writes and narrow terminals. They do not certify installed-host
dispatcher/PTY/palette/pointer behavior or live Jira. No live smoke test is
included. Type checking uses published V2 host declarations and OpenTUI JSX
types; the inherited implementation still uses broad context adapters.

The root tooling override pins patched Seroval 1.6.3 for the locked development
tree. Dependency-package overrides are ignored by npm consumers; this does
not patch OpenCode's externally supplied Solid runtime. Check host advisories
and updates separately.
