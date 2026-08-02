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

  // Live refresh on markdown source buffer changes (even without saving the file).
  // This makes @@key@@ and [[include]] resolve immediately in preview while you type,
  // without requiring a manual save of the original .md first.
  let refreshTimeout;
  const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (
      event.document.languageId === "markdown" &&
      event.document.uri.scheme === "file"
    ) {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        vscode.commands.executeCommand("markdown.preview.refresh").then(
          () => undefined,
          () => undefined
        );
      }, 250); // light debounce
    }
  });
  context.subscriptions.push(textChangeListener);

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
      const baseDir = path.dirname(document.uri.fsPath);
      const resolved = resolveMarkdownSource(document.getText(), meta || {}, baseDir);
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
 * [[filename]] or [[url | filename]] transclusion also resolved here.
 */
function markdownMetaLinksPlugin(md) {
  // Early block-level rule: expand [[include]] / [[url | filename]] at SOURCE level
  // BEFORE any block parsing. This ensures included Markdown (with its headings,
  // paragraphs, lists, blank lines, etc.) is inserted with ORIGINAL structure preserved.
  // Recursively resolves nested [[ ]] inside included files.
  // @@ markers inside includes are left for the later inline rule to handle.
  md.core.ruler.before("block", "markdown_meta_links_includes", (state) => {
    const mdFilePath = getMarkdownPathFromEnv(state.env);
    if (!mdFilePath) {
      return;
    }
    const baseDir = path.dirname(mdFilePath);
    if (state.src && baseDir) {
      state.src = resolveIncludesInSource(state.src, baseDir);
    }
  });

  md.core.ruler.before("inline", "markdown_meta_links_pre_inline", (state) => {
    const mdFilePath = getMarkdownPathFromEnv(state.env);
    if (!mdFilePath) {
      return;
    }

    const meta = loadMetaForMarkdownFile(mdFilePath);
    if (!meta) {
      return;
    }

    const baseDir = path.dirname(mdFilePath);
    for (const token of state.tokens) {
      if (token.type === "inline" && typeof token.content === "string") {
        token.content = resolveInlineText(token.content, meta, baseDir);
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

function findMetaFilesForMarkdown(markdownFilePath) {
  const config = getConfig();
  const metas = [];
  let dir = path.dirname(markdownFilePath);
  const seen = new Set();

  while (true) {
    const candidate = path.join(dir, config.metaFileName);

    if (fs.existsSync(candidate) && !seen.has(candidate)) {
      metas.push(candidate);
      seen.add(candidate);
    }

    if (!config.searchParentDirectories) {
      break;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return metas;
}

function loadMetaForMarkdownFile(markdownFilePath) {
  const metaPaths = findMetaFilesForMarkdown(markdownFilePath);
  if (metaPaths.length === 0) {
    return undefined;
  }

  let merged = {};
  // Merge from farthest ancestor to closest (child overrides parent)
  for (let i = metaPaths.length - 1; i >= 0; i--) {
    const metaPath = metaPaths[i];
    try {
      const stat = fs.statSync(metaPath);
      const cached = metaCache.get(metaPath);

      let parsedMeta;
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        parsedMeta = cached.meta;
      } else {
        const raw = fs.readFileSync(metaPath, "utf8");
        parsedMeta = parseSimpleTomlMeta(raw);
        metaCache.set(metaPath, {
          mtimeMs: stat.mtimeMs,
          meta: parsedMeta
        });
      }

      merged = { ...merged, ...parsedMeta };
    } catch {
      // ignore broken meta file
    }
  }

  // Expand $PREFIX$ / $VAR$ references in hrefs (and prefix definitions themselves)
  return expandMetaPrefixes(merged);
}

/**
 * Expand $VAR$ placeholders in meta values.
 * VAR can be any key whose value is string (or array's last string).
 * Supports recursive expansion with cycle detection.
 * Used for PREFIX1 = "https://..." ; FOO = "$PREFIX1$/bar"
 */
function expandMetaPrefixes(meta) {
  const prefixValues = new Map();
  const resolving = new Set();

  function expandString(str, metaObj) {
    if (typeof str !== "string") return str;
    return str.replace(/\$([A-Za-z0-9_-]+)\$/g, (match, varName) => {
      if (prefixValues.has(varName)) {
        return prefixValues.get(varName);
      }
      if (resolving.has(varName)) {
        return match; // cycle detected, keep as-is
      }
      const val = metaObj[varName];
      if (typeof val === "string") {
        resolving.add(varName);
        const expanded = expandString(val, metaObj);
        resolving.delete(varName);
        prefixValues.set(varName, expanded);
        return expanded;
      } else if (Array.isArray(val) && val.length > 0) {
        const last = val[val.length - 1];
        if (typeof last === "string") {
          resolving.add(varName);
          const expandedLast = expandString(last, metaObj);
          resolving.delete(varName);
          prefixValues.set(varName, expandedLast);
          return expandedLast;
        }
      }
      return match;
    });
  }

  const result = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string") {
      result[key] = expandString(value, meta);
    } else if (Array.isArray(value) && value.length > 0) {
      const newArr = value.slice();
      const lastIdx = newArr.length - 1;
      if (typeof newArr[lastIdx] === "string") {
        newArr[lastIdx] = expandString(newArr[lastIdx], meta);
      }
      result[key] = newArr;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Keep old single-file finder for compatibility (unused now but harmless)
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

function resolveMarkdownSource(source, meta, baseDir) {
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

    out.push(resolveInlineText(line, meta, baseDir));
  }

  return out.join("\n");
}

/**
 * Replace @@key@@ / @@key[index]@@ and [[filename]] / [[url | filename]]
 * (transclude file content, strip leading/trailing blank lines)
 * outside inline backtick code spans and fenced code blocks.
 * Included content is recursively resolved for markers.
 */
function resolveInlineText(text, meta, baseDir) {
  if (!meta) meta = {};
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

    if (text[i] === "[" && text[i + 1] === "[") {
      const inc = readIncludeMarker(text, i);

      if (inc) {
        let replacement = inc.raw;
        if (baseDir) {
          const fullPath = path.resolve(baseDir, inc.filename);
          const incContent = getStrippedFileContent(fullPath);
          if (incContent !== undefined) {
            // recursively resolve @@ and nested [[ in the included content
            replacement = resolveInlineText(incContent, meta, baseDir);
          }
        }
        out += replacement;
        i = inc.nextIndex;
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

function readIncludeMarker(text, start) {
  if (text[start] !== "[" || text[start + 1] !== "[") {
    return undefined;
  }
  const end = text.indexOf("]]", start + 2);
  if (end < 0) {
    return undefined;
  }

  const raw = text.slice(start, end + 2);
  const inner = text.slice(start + 2, end).trim();

  let filename = inner;
  if (inner.includes("|")) {
    // [[url | filename]] or [[anything | filename]] -> use last segment as filename
    const parts = inner.split("|");
    filename = parts[parts.length - 1].trim();
  }

  if (!filename) {
    return undefined;
  }

  return {
    raw,
    filename,
    nextIndex: end + 2
  };
}

function getStrippedFileContent(absPath) {
  try {
    if (!fs.existsSync(absPath)) return undefined;
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return undefined;

    const raw = fs.readFileSync(absPath, "utf8");
    const lines = raw.split(/\r?\n/);
    let s = 0;
    while (s < lines.length && lines[s].trim() === "") s++;
    let e = lines.length - 1;
    while (e >= s && lines[e].trim() === "") e--;
    if (s > e) return "";
    return lines.slice(s, e + 1).join("\n");
  } catch {
    return undefined;
  }
}

/**
 * Source-level resolver for [[filename]] and [[url | filename]] ONLY.
 * Skips fenced code blocks and inline code spans.
 * Recursively expands includes inside included content.
 * Used in preview (early, before block parsing) to preserve original
 * Markdown block structure (newlines, blank lines, headings, etc.) from
 * the included file. Only leading/trailing blank lines of the WHOLE
 * included file are stripped.
 */
function resolveIncludesInSource(source, baseDir) {
  if (!baseDir || typeof source !== "string") return source;

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

    out.push(resolveIncludesInLine(line, baseDir));
  }

  return out.join("\n");
}

function resolveIncludesInLine(text, baseDir) {
  if (!baseDir || typeof text !== "string") return text;

  let out = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "`") {
      const span = readBacktickSpan(text, i);
      out += span.text;
      i = span.nextIndex;
      continue;
    }

    if (text[i] === "[" && text[i + 1] === "[") {
      const inc = readIncludeMarker(text, i);
      if (inc) {
        let replacement = inc.raw;
        const fullPath = path.resolve(baseDir, inc.filename);
        const incContent = getStrippedFileContent(fullPath);
        if (incContent !== undefined) {
          // Recurse for nested includes inside the included file
          replacement = resolveIncludesInSource(incContent, baseDir);
        }
        out += replacement;
        i = inc.nextIndex;
        continue;
      }
    }

    out += text[i];
    i++;
  }

  return out;
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
