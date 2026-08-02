"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const DEFAULT_META_FILE_NAME = "__meta__.toml";

const metaCache = new Map();

/**
 * VS Code extension entry.
 */
function activate(context) {
  const watcher = vscode.workspace.createFileSystemWatcher("**/__meta__.toml");

  const clearCacheAndRefreshPreview = () => {
    metaCache.clear();
    vscode.commands.executeCommand("markdown.preview.refresh").then(
      () => undefined,
      () => undefined
    );
  };

  watcher.onDidCreate(clearCacheAndRefreshPreview);
  watcher.onDidChange(clearCacheAndRefreshPreview);
  watcher.onDidDelete(clearCacheAndRefreshPreview);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.commands.registerCommand("markdownMetaLinks.reloadMeta", () => {
      clearCacheAndRefreshPreview();
      vscode.window.showInformationMessage("Markdown Meta Links: reloaded __meta__.toml");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markdownMetaLinks.exportResolvedMarkdown", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "markdown") {
        vscode.window.showWarningMessage("Open a Markdown file first.");
        return;
      }

      const document = editor.document;
      if (document.uri.scheme !== "file") {
        vscode.window.showWarningMessage("Only file-based Markdown documents are supported.");
        return;
      }

      const meta = loadMetaForMarkdownFile(document.uri.fsPath);
      const resolved = resolveMarkdownSource(document.getText(), meta || {});
      const outPath = makeResolvedMarkdownPath(document.uri.fsPath);

      fs.writeFileSync(outPath, resolved, "utf8");

      const outDoc = await vscode.workspace.openTextDocument(outPath);
      await vscode.window.showTextDocument(outDoc, { preview: false });

      vscode.window.showInformationMessage(`Exported resolved Markdown: ${path.basename(outPath)}`);
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "markdown", scheme: "file" },
      new MetaLinksCompletionProvider(),
      "@",
      "["
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: "markdown", scheme: "file" },
      new MetaLinksHoverProvider()
    )
  );

  return {
    extendMarkdownIt(md) {
      return md.use(markdownMetaLinksPlugin);
    }
  };
}

/**
 * markdown-it plugin.
 *
 * Important:
 * Use core rule before "inline", after block parsing.
 * This avoids changing fenced code blocks, but still runs before Markdown inline parsing.
 * So @@__mro_entries__[1]@@ will not be broken by emphasis parsing.
 */
function markdownMetaLinksPlugin(md) {
  md.core.ruler.before("inline", "markdown_meta_links_pre_inline", (state) => {
    const mdFilePath = getMarkdownPathFromEnv(state.env);
    if (!mdFilePath) {
      return;
    }

    const meta = loadMetaForMarkdownFile(mdFilePath);
    if (!meta) {
      return;
    }

    for (const token of state.tokens) {
      if (token.type === "inline" && typeof token.content === "string") {
        token.content = resolveInlineText(token.content, meta);
      }
    }
  });
}

function getMarkdownPathFromEnv(env) {
  const currentDocument = env && env.currentDocument;

  if (currentDocument && currentDocument.uri && currentDocument.uri.fsPath) {
    return currentDocument.uri.fsPath;
  }

  if (currentDocument && currentDocument.fsPath) {
    return currentDocument.fsPath;
  }

  const editor = vscode.window.activeTextEditor;
  if (
    editor &&
    editor.document &&
    editor.document.languageId === "markdown" &&
    editor.document.uri.scheme === "file"
  ) {
    return editor.document.uri.fsPath;
  }

  return undefined;
}

function getConfig() {
  const config = vscode.workspace.getConfiguration("markdownMetaLinks");

  return {
    metaFileName: config.get("metaFileName", DEFAULT_META_FILE_NAME),
    searchParentDirectories: config.get("searchParentDirectories", false),
    unresolvedBehavior: config.get("unresolvedBehavior", "keep")
  };
}

function loadMetaForMarkdownFile(markdownFilePath) {
  const metaPath = findMetaFileForMarkdown(markdownFilePath);
  if (!metaPath) {
    return undefined;
  }

  try {
    const stat = fs.statSync(metaPath);
    const cached = metaCache.get(metaPath);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.meta;
    }

    const raw = fs.readFileSync(metaPath, "utf8");
    const meta = parseSimpleTomlMeta(raw);

    metaCache.set(metaPath, {
      mtimeMs: stat.mtimeMs,
      meta
    });

    return meta;
  } catch {
    return undefined;
  }
}

function findMetaFileForMarkdown(markdownFilePath) {
  const config = getConfig();
  let dir = path.dirname(markdownFilePath);

  while (true) {
    const candidate = path.join(dir, config.metaFileName);

    if (fs.existsSync(candidate)) {
      return candidate;
    }

    if (!config.searchParentDirectories) {
      return undefined;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }

    dir = parent;
  }
}

/**
 * Parse a small useful subset of TOML:
 *
 * KEY = "url"
 *
 * KEY = [
 *   "label 0",
 *   "label 1",
 *   "url"
 * ]
 *
 * This is intentionally tolerant:
 * - invalid lines are ignored
 * - unsupported values are ignored
 * - comments outside strings are ignored
 */
function parseSimpleTomlMeta(raw) {
  const meta = {};
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = stripTomlComment(lines[i]).trim();

    if (!line) {
      continue;
    }

    const equalIndex = findCharOutsideString(line, "=");
    if (equalIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let valuePart = line.slice(equalIndex + 1).trim();

    if (!isSupportedBareKey(key)) {
      continue;
    }

    if (valuePart.startsWith("[") && !arrayTextComplete(valuePart)) {
      while (i + 1 < lines.length) {
        i++;
        valuePart += "\n" + stripTomlComment(lines[i]);

        if (arrayTextComplete(valuePart)) {
          break;
        }
      }
    }

    const parsed = parseTomlValue(valuePart);
    if (typeof parsed === "string") {
      meta[key] = parsed;
    } else if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      meta[key] = parsed;
    }
  }

  return meta;
}

function isSupportedBareKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key);
}

function parseTomlValue(valueText) {
  const text = valueText.trim();

  if (text.startsWith('"')) {
    return parseTomlString(text);
  }

  if (text.startsWith("'")) {
    return parseTomlLiteralString(text);
  }

  if (text.startsWith("[")) {
    return parseTomlStringArray(text);
  }

  return undefined;
}

function parseTomlString(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('"')) {
    return undefined;
  }

  let end = -1;
  let escaped = false;

  for (let i = 1; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      end = i;
      break;
    }
  }

  if (end < 0) {
    return undefined;
  }

  const literal = trimmed.slice(0, end + 1);

  try {
    return JSON.parse(literal);
  } catch {
    return undefined;
  }
}

function parseTomlLiteralString(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("'")) {
    return undefined;
  }

  const end = trimmed.indexOf("'", 1);
  if (end < 0) {
    return undefined;
  }

  return trimmed.slice(1, end);
}

function parseTomlStringArray(text) {
  const trimmed = text.trim();

  if (!trimmed.startsWith("[") || !arrayTextComplete(trimmed)) {
    return undefined;
  }

  const content = trimmed.slice(1, findMatchingArrayClose(trimmed));
  const values = [];
  let i = 0;

  while (i < content.length) {
    while (i < content.length && /[\s,]/.test(content[i])) {
      i++;
    }

    if (i >= content.length) {
      break;
    }

    if (content[i] === '"') {
      const parsed = parseStringAt(content, i, '"');
      if (!parsed) {
        return undefined;
      }

      values.push(parsed.value);
      i = parsed.nextIndex;
      continue;
    }

    if (content[i] === "'") {
      const parsed = parseStringAt(content, i, "'");
      if (!parsed) {
        return undefined;
      }

      values.push(parsed.value);
      i = parsed.nextIndex;
      continue;
    }

    return undefined;
  }

  return values;
}

function parseStringAt(text, start, quote) {
  if (quote === "'") {
    const end = text.indexOf("'", start + 1);
    if (end < 0) {
      return undefined;
    }

    return {
      value: text.slice(start + 1, end),
      nextIndex: end + 1
    };
  }

  let escaped = false;

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      const literal = text.slice(start, i + 1);

      try {
        return {
          value: JSON.parse(literal),
          nextIndex: i + 1
        };
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function stripTomlComment(line) {
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inBasic) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inBasic = false;
      }
      continue;
    }

    if (inLiteral) {
      if (ch === "'") {
        inLiteral = false;
      }
      continue;
    }

    if (ch === '"') {
      inBasic = true;
      continue;
    }

    if (ch === "'") {
      inLiteral = true;
      continue;
    }

    if (ch === "#") {
      return line.slice(0, i);
    }
  }

  return line;
}

function findCharOutsideString(text, targetChar) {
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inBasic) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inBasic = false;
      }
      continue;
    }

    if (inLiteral) {
      if (ch === "'") {
        inLiteral = false;
      }
      continue;
    }

    if (ch === '"') {
      inBasic = true;
      continue;
    }

    if (ch === "'") {
      inLiteral = true;
      continue;
    }

    if (ch === targetChar) {
      return i;
    }
  }

  return -1;
}

function arrayTextComplete(text) {
  return findMatchingArrayClose(text) >= 0;
}

function findMatchingArrayClose(text) {
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inBasic) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inBasic = false;
      }
      continue;
    }

    if (inLiteral) {
      if (ch === "'") {
        inLiteral = false;
      }
      continue;
    }

    if (ch === '"') {
      inBasic = true;
      continue;
    }

    if (ch === "'") {
      inLiteral = true;
      continue;
    }

    if (ch === "]") {
      return i;
    }
  }

  return -1;
}

function resolveMarkdownSource(source, meta) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceMarker = "";

  for (const line of lines) {
    const fence = line.match(/^(\s*)(`{3,}|~{3,})/);

    if (fence) {
      const marker = fence[2];

      if (!inFence) {
        inFence = true;
        fenceMarker = marker[0];
      } else if (marker[0] === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }

      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    out.push(resolveInlineText(line, meta));
  }

  return out.join("\n");
}

/**
 * Replace @@key@@ and @@key[index]@@ outside inline backtick code spans.
 */
function resolveInlineText(text, meta) {
  let out = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "`") {
      const span = readBacktickSpan(text, i);
      out += span.text;
      i = span.nextIndex;
      continue;
    }

    if (text[i] === "@" && text[i + 1] === "@") {
      const ref = readMetaRef(text, i);

      if (ref) {
        const resolved = resolveMetaRef(meta, ref.key, ref.index);

        if (resolved) {
          out += makeMarkdownLink(resolved.label, resolved.href);
        } else {
          out += ref.raw;
        }

        i = ref.nextIndex;
        continue;
      }
    }

    out += text[i];
    i++;
  }

  return out;
}

function readBacktickSpan(text, start) {
  let tickCount = 0;

  while (text[start + tickCount] === "`") {
    tickCount++;
  }

  const marker = "`".repeat(tickCount);
  const end = text.indexOf(marker, start + tickCount);

  if (end < 0) {
    return {
      text: text.slice(start),
      nextIndex: text.length
    };
  }

  return {
    text: text.slice(start, end + tickCount),
    nextIndex: end + tickCount
  };
}

function readMetaRef(text, start) {
  const end = text.indexOf("@@", start + 2);
  if (end < 0) {
    return undefined;
  }

  const raw = text.slice(start, end + 2);
  const inner = text.slice(start + 2, end);

  const match = inner.match(/^([A-Za-z0-9_-]+)(?:\[(\d+)\])?$/);
  if (!match) {
    return undefined;
  }

  return {
    raw,
    key: match[1],
    index: match[2] === undefined ? undefined : Number(match[2]),
    nextIndex: end + 2
  };
}

function resolveMetaRef(meta, key, index) {
  const value = meta[key];

  if (typeof value === "string") {
    if (!isSafeHref(value)) {
      return undefined;
    }

    return {
      label: key,
      href: value
    };
  }

  if (Array.isArray(value)) {
    if (value.length < 2) {
      return undefined;
    }

    const href = value[value.length - 1];
    if (!isSafeHref(href)) {
      return undefined;
    }

    const labelCount = value.length - 1;
    const labelIndex = index === undefined ? 0 : index;

    if (!Number.isInteger(labelIndex) || labelIndex < 0 || labelIndex >= labelCount) {
      return undefined;
    }

    return {
      label: value[labelIndex],
      href
    };
  }

  return undefined;
}

function isSafeHref(href) {
  if (typeof href !== "string") {
    return false;
  }

  const trimmed = href.trim();

  if (!trimmed) {
    return false;
  }

  if (/^\s*javascript:/i.test(trimmed)) {
    return false;
  }

  return true;
}

function makeMarkdownLink(label, href) {
  return `[${escapeMarkdownLinkText(label)}](<${escapeMarkdownLinkDestination(href)}>)`;
}

function escapeMarkdownLinkText(text) {
  return String(text).replace(/([\\`*_{}\[\]()#+\-.!|])/g, "\\$1");
}

function escapeMarkdownLinkDestination(href) {
  return String(href)
    .trim()
    .replace(/\\/g, "%5C")
    .replace(/>/g, "%3E")
    .replace(/\s/g, "%20");
}

function makeResolvedMarkdownPath(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  return path.join(dir, `${base}.resolved${ext || ".md"}`);
}

class MetaLinksCompletionProvider {
  provideCompletionItems(document, position) {
    if (document.uri.scheme !== "file") {
      return undefined;
    }

    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const match = linePrefix.match(/@@([A-Za-z0-9_-]*)$/);

    if (!match) {
      return undefined;
    }

    const typed = match[1] || "";
    const startCharacter = position.character - typed.length;
    const range = new vscode.Range(
      new vscode.Position(position.line, startCharacter),
      position
    );

    const meta = loadMetaForMarkdownFile(document.uri.fsPath);
    if (!meta) {
      return undefined;
    }

    const items = [];

    for (const key of Object.keys(meta).sort()) {
      const value = meta[key];

      const baseItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Reference);
      baseItem.range = range;
      baseItem.insertText = `${key}@@`;
      baseItem.detail = "Markdown Meta Link";
      baseItem.documentation = makeCompletionDocumentation(meta, key, undefined);
      items.push(baseItem);

      if (Array.isArray(value) && value.length > 2) {
        for (let i = 0; i < value.length - 1; i++) {
          const indexedKey = `${key}[${i}]`;
          const indexedItem = new vscode.CompletionItem(
            indexedKey,
            vscode.CompletionItemKind.Reference
          );

          indexedItem.range = range;
          indexedItem.insertText = `${indexedKey}@@`;
          indexedItem.detail = "Markdown Meta Link";
          indexedItem.documentation = makeCompletionDocumentation(meta, key, i);
          items.push(indexedItem);
        }
      }
    }

    return items;
  }
}

function makeCompletionDocumentation(meta, key, index) {
  const resolved = resolveMetaRef(meta, key, index);
  if (!resolved) {
    return undefined;
  }

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`Preview: [${escapeMarkdownLinkText(resolved.label)}](${resolved.href})`);
  return md;
}

class MetaLinksHoverProvider {
  provideHover(document, position) {
    if (document.uri.scheme !== "file") {
      return undefined;
    }

    const range = document.getWordRangeAtPosition(
      position,
      /@@[A-Za-z0-9_-]+(?:\[\d+\])?@@/
    );

    if (!range) {
      return undefined;
    }

    const raw = document.getText(range);
    const ref = readMetaRef(raw, 0);

    if (!ref) {
      return undefined;
    }

    const meta = loadMetaForMarkdownFile(document.uri.fsPath);
    if (!meta) {
      return new vscode.Hover("No `__meta__.toml` found.", range);
    }

    const resolved = resolveMetaRef(meta, ref.key, ref.index);
    if (!resolved) {
      return new vscode.Hover("Unresolved meta link. It will be kept as-is in preview.", range);
    }

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`Meta link: [${escapeMarkdownLinkText(resolved.label)}](${resolved.href})`);
    md.isTrusted = false;

    return new vscode.Hover(md, range);
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};