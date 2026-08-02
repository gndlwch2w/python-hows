# Markdown Meta Links

A VS Code Markdown Preview extension for resolving `@@key@@` references from a `__meta__.toml` file placed beside the Markdown file.

## Supported syntax

```toml
LOAD_BUILD_CLASS = "https://docs.python.org/zh-cn/3.14/library/dis.html#opcode-LOAD_BUILD_CLASS"

type = [
  "type(name, bases, ns, **kwargs)",
  "type()",
  "https://docs.python.org/zh-cn/3.14/library/functions.html#type"
]
```

```md
@@LOAD_BUILD_CLASS@@
@@type@@
@@type[0]@@
@@type[1]@@
@@not-yet-defined@@
```

Preview output:

```md
[LOAD_BUILD_CLASS](https://docs.python.org/zh-cn/3.14/library/dis.html#opcode-LOAD_BUILD_CLASS)
[type(name, bases, ns, **kwargs)](https://docs.python.org/zh-cn/3.14/library/functions.html#type)
[type(name, bases, ns, **kwargs)](https://docs.python.org/zh-cn/3.14/library/functions.html#type)
[type()](https://docs.python.org/zh-cn/3.14/library/functions.html#type)
@@not-yet-defined@@
```

For array values, the last string is treated as the link target; all preceding strings are available labels. `@@key@@` means `@@key[0]@@`.

## Features

- Resolves markers only in Markdown Preview. Your original `.md` file is not modified.
- Looks for `__meta__.toml` in the same directory as the Markdown file.
- Leaves unresolved markers unchanged by default.
- Does not replace markers inside inline code, fenced code blocks, or existing Markdown links in preview.
- Offers completion items after typing `@@`.
- Shows hover information over markers.
- Provides `Markdown Meta Links: Export Resolved Markdown` to create `filename.resolved.md`.
- Provides `Markdown Meta Links: Reload __meta__.toml` to clear cache and refresh preview.

## Settings

- `markdownMetaLinks.metaFileName`: default `__meta__.toml`
- `markdownMetaLinks.searchParentDirectories`: default `false`
- `markdownMetaLinks.unresolvedBehavior`: default `keep`; can be `keep` or `plain`

## Install from VSIX

1. Open VS Code.
2. Open Extensions view.
3. Select `...` -> `Install from VSIX...`.
4. Choose `markdown-meta-links-0.1.0.vsix`.
5. Reload VS Code if prompted.

Command line:

```bash
code --install-extension markdown-meta-links-0.1.0.vsix
```

## Local development

Open this folder in VS Code and press `F5` to launch an Extension Development Host.

No npm install is required because the extension is plain JavaScript and has no runtime dependencies.
