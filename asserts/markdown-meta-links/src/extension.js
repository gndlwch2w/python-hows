"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const DEFAULT_META_FILE_NAME = "__meta__.toml";
const META_DY_FILE_NAME = ".__meta__.dy.toml";

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
  watcher.onDidDelete((uri) => {
    clearCacheAndRefreshPreview();
    // also try remove corresponding dy file
    try {
      const dyPath = path.join(path.dirname(uri.fsPath), META_DY_FILE_NAME);
      if (fs.existsSync(dyPath)) fs.unlinkSync(dyPath);
    } catch {}
  });
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
      const resolved = resolveMarkdownSource(document.getText(), meta || {}, document.uri.fsPath);
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

    // === Block-level include support for preview ===
    // If a top-level paragraph consists ONLY of [[filename]] (or [[url|filename]]),
    // replace that paragraph token with the fully parsed tokens of the resolved included
    // Markdown. This preserves original block structure (headings, lists, paragraphs,
    // blank lines, etc.) instead of collapsing everything into one inline line.
    for (let i = 0; i < state.tokens.length; i++) {
      const tok = state.tokens[i];
      if (tok.type === "paragraph" && tok.children && tok.children.length === 1) {
        const inlineTok = tok.children[0];
        if (inlineTok.type === "inline" && typeof inlineTok.content === "string") {
          const contentTrim = inlineTok.content.trim();
          if (contentTrim.startsWith("[[") && contentTrim.endsWith("]]")) {
            const incRef = readIncludeRef(contentTrim, 0);
            if (incRef) {
              const resolvedInc = resolveIncludedContent(incRef.filename, mdFilePath);
              if (resolvedInc) {
                // Parse the already-fully-resolved included source (its @@ / [[ ]] already done
                // recursively using the included file's own meta). This gives us proper block tokens.
                const includedEnv = { ...state.env };
                // Give the included content its own document context if possible (for any further meta loads)
                if (includedEnv.currentDocument) {
                  // We don't change fsPath here because resolveIncludedContent already used the target's meta.
                }
                const includedTokens = md.parse(resolvedInc, includedEnv);

                // Replace the current paragraph with the included token list.
                // This makes preview render the included .md exactly as authored (structure preserved).
                state.tokens.splice(i, 1, ...includedTokens);
                // Adjust loop index for the newly inserted tokens
                i += includedTokens.length - 1;
                continue;
              }
            }
          }
        }
      }
    }

    // Normal inline processing for @@ and any remaining inline [[ ]] (inside paragraphs)
    for (const token of state.tokens) {
      if (token.type === "inline" && typeof token.content === "string") {
        token.content = resolveInlineText(token.content, meta, mdFilePath);
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

  const metaDir = path.dirname(metaPath);
  const dyPath = path.join(metaDir, META_DY_FILE_NAME);

  try {
    const metaStat = fs.statSync(metaPath);
    let needRebuild = true;

    if (fs.existsSync(dyPath)) {
      const dyStat = fs.statSync(dyPath);
      if (dyStat.mtimeMs >= metaStat.mtimeMs) {
        needRebuild = false;
      }
    }

    if (needRebuild) {
      const raw = fs.readFileSync(metaPath, "utf8");
      const config = getConfig();
      let inherited = {};
      if (config.searchParentDirectories) {
        inherited = getInheritedSubstMap(metaDir, metaPath);
      }
      const expanded = expandComplexMetaToSimple(raw, inherited);
      const dyContent = simpleMetaToToml(expanded);
      fs.writeFileSync(dyPath, dyContent, "utf8");
    }

    if (fs.existsSync(dyPath)) {
      const stat = fs.statSync(dyPath);
      const cached = metaCache.get(dyPath);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.meta;
      }
      const rawDy = fs.readFileSync(dyPath, "utf8");
      const meta = parseSimpleTomlMeta(rawDy);
      metaCache.set(dyPath, {
        mtimeMs: stat.mtimeMs,
        meta
      });
      return meta;
    }

    // fallback to direct parse (should not happen normally)
    const raw = fs.readFileSync(metaPath, "utf8");
    return parseSimpleTomlMeta(raw);
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
 * Collect inherited prefix/url substitutions from ancestor __meta__.toml files (recursively).
 * Only used when searchParentDirectories is enabled.
 */
function getInheritedSubstMap(metaDir, excludeMetaPath) {
  const subst = {};
  let dir = path.dirname(metaDir);

  while (dir && dir !== path.parse(dir).root) {
    const pMetaPath = path.join(dir, DEFAULT_META_FILE_NAME);
    if (fs.existsSync(pMetaPath) && pMetaPath !== excludeMetaPath) {
      try {
        const pRaw = fs.readFileSync(pMetaPath, "utf8");
        const pInherited = getInheritedSubstMap(dir, pMetaPath);
        const pExpanded = expandComplexMetaToSimple(pRaw, pInherited);
        for (const [k, v] of Object.entries(pExpanded)) {
          if (typeof v === "string") {
            subst[k] = v;
          } else if (Array.isArray(v) && v.length > 0) {
            const last = v[v.length - 1];
            if (typeof last === "string") subst[k] = last;
          }
        }
      } catch {
        // ignore broken parent meta
      }
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }
  return subst;
}

/**
 * Parse complex __meta__.toml supporting top-level entries + [BLOCK] sections
 * with TEMPLATE, GROUP/GROUPS, and entry definitions.
 */
function parseComplexMeta(raw) {
  const topLevel = {};
  const blocks = {};
  let currentBlockName = null;

  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let line = stripTomlComment(lines[i]).trim();
    if (!line) continue;

    // [section]
    const secMatch = line.match(/^\[([A-Za-z0-9_-]+)\]$/);
    if (secMatch) {
      currentBlockName = secMatch[1];
      if (!blocks[currentBlockName]) {
        blocks[currentBlockName] = { template: undefined, group: undefined, entries: {} };
      }
      continue;
    }

    const equalIndex = findCharOutsideString(line, "=");
    if (equalIndex < 0) continue;

    const key = line.slice(0, equalIndex).trim();
    if (!isSupportedBareKey(key)) continue;

    let valuePart = line.slice(equalIndex + 1).trim();

    if (valuePart.startsWith("[") && !arrayTextComplete(valuePart)) {
      while (i + 1 < lines.length) {
        i++;
        valuePart += "\n" + stripTomlComment(lines[i]);
        if (arrayTextComplete(valuePart)) break;
      }
    }

    const parsed = parseTomlValue(valuePart);
    if (parsed === undefined) continue;

    if (currentBlockName) {
      const b = blocks[currentBlockName];
      const ukey = key.toUpperCase();
      if (ukey === "TEMPLATE") {
        if (typeof parsed === "string") b.template = parsed;
      } else if (ukey === "GROUP" || ukey === "GROUPS") {
        b.group = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } else {
        b.entries[key] = parsed;
      }
    } else {
      topLevel[key] = parsed;
    }
  }

  return { topLevel, blocks };
}

/**
 * Expand complex meta (with prefixes $NAME$, [BLOCK] + TEMPLATE/GROUP + special entry forms)
 * into simple meta { key: [label0, label1, ..., url] | "url" }
 * Fully resolves all $ substitutions using inherited + local definitions.
 */
function expandComplexMetaToSimple(raw, inheritedSubst = {}) {
  const parsed = parseComplexMeta(raw);
  const substMap = { ...inheritedSubst };
  const entries = {};

  function resolveStrWith(s, localSubst = {}) {
    if (typeof s !== "string") return s;
    let out = s;
    let prev;
    let iters = 0;
    const sm = { ...substMap, ...localSubst };
    do {
      prev = out;
      out = out.replace(/\$([A-Za-z0-9_-]+)\$/g, (_, name) => {
        return sm.hasOwnProperty(name) ? sm[name] : `$${name}$`;
      });
      iters++;
    } while (out !== prev && iters < 20);
    return out;
  }

  function resolveValWith(v, localSubst = {}) {
    if (typeof v === "string") return resolveStrWith(v, localSubst);
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "string" ? resolveStrWith(x, localSubst) : x));
    }
    return v;
  }

  // --- Top level entries (support chained $PREFIX$ etc) ---
  let pendingTop = Object.keys(parsed.topLevel);
  let safety = 0;
  while (pendingTop.length > 0 && safety++ < 50) {
    const nextPending = [];
    for (const key of pendingTop) {
      const rawV = parsed.topLevel[key];
      const resV = resolveValWith(rawV, {});
      if (typeof resV === "string") {
        if (!resV.includes("$")) {
          entries[key] = [key, resV];
          substMap[key] = resV;
        } else {
          nextPending.push(key);
        }
      } else if (Array.isArray(resV)) {
        const last = resV[resV.length - 1];
        if (typeof last !== "string" || !last.includes("$")) {
          entries[key] = resV;
          if (typeof last === "string") substMap[key] = last;
        } else {
          nextPending.push(key);
        }
      }
    }
    pendingTop = nextPending;
  }
  // remaining partial
  for (const key of pendingTop) {
    const resV = resolveValWith(parsed.topLevel[key], {});
    if (typeof resV === "string") {
      entries[key] = [key, resV];
      substMap[key] = resV;
    } else if (Array.isArray(resV)) {
      entries[key] = resV;
      const last = resV[resV.length - 1];
      if (typeof last === "string") substMap[key] = last;
    }
  }

  // --- Blocks ---
  for (const [bname, bdata] of Object.entries(parsed.blocks)) {
    const localBlockSubst = {};
    let templateStr = bdata.template ? resolveStrWith(bdata.template, localBlockSubst) : null;

    // GROUP / GROUPS
    const groupArr = bdata.group || [];
    for (const gname of groupArr) {
      if (typeof gname !== "string" || !gname) continue;
      if (templateStr) {
        const u = templateStr.replace(/\$VAR\$/g, gname);
        if (isSafeHref(u)) {
          entries[gname] = [gname, u];
          substMap[gname] = u;
          localBlockSubst[gname] = u;
        }
      }
    }

    // explicit entries inside block (with $VAR_ support + template)
    let pendingBlock = Object.keys(bdata.entries || {}).filter(
      (k) => !["TEMPLATE", "GROUP", "GROUPS"].includes(k.toUpperCase())
    );
    safety = 0;
    while (pendingBlock.length > 0 && safety++ < 50) {
      const nextP = [];
      for (const key of pendingBlock) {
        const rawV = bdata.entries[key];
        const resV = resolveValWith(rawV, localBlockSubst);

        let labels = [];
        let finalUrl = null;
        let varName = key;
        let useTemplate = !!templateStr;

        if (typeof resV === "string") {
          const rv = resV.trim();
          if (rv === "" || rv === "[]") {
            labels = [key];
          } else if (rv.startsWith("$VAR_")) {
            varName = rv.slice(5).trim();
            labels = [key];
          } else if (/^https?:\/\//i.test(rv) || rv.includes("://")) {
            finalUrl = rv;
            useTemplate = false;
            labels = [key];
          } else {
            labels = [rv];
          }
        } else if (Array.isArray(resV)) {
          if (resV.length === 0) {
            labels = [key];
          } else {
            let lastItem = resV[resV.length - 1];
            if (typeof lastItem === "string") {
              lastItem = lastItem.trim();
              if (lastItem.startsWith("$VAR_")) {
                varName = lastItem.slice(5).trim();
                labels = resV
                  .slice(0, -1)
                  .map((x) => (typeof x === "string" ? x.trim() : x))
                  .filter(Boolean);
                if (labels.length === 0) labels = [key];
              } else if (/^https?:\/\//i.test(lastItem) || lastItem.includes("://") || isSafeHref(lastItem)) {
                finalUrl = lastItem;
                useTemplate = false;
                labels = resV
                  .slice(0, -1)
                  .map((x) => (typeof x === "string" ? x.trim() : x))
                  .filter(Boolean);
                if (labels.length === 0) labels = [key];
              } else {
                labels = resV.map((x) => (typeof x === "string" ? x.trim() : x)).filter(Boolean);
              }
            } else {
              labels = resV;
            }
          }
        } else {
          continue;
        }

        if (!finalUrl && useTemplate && templateStr) {
          finalUrl = templateStr.replace(/\$VAR\$/g, varName);
        }

        if (finalUrl && isSafeHref(finalUrl)) {
          const arr = labels.length > 0 ? [...labels, finalUrl] : [key, finalUrl];
          if (!finalUrl.includes("$")) {
            entries[key] = arr;
            substMap[key] = finalUrl;
            localBlockSubst[key] = finalUrl;
          } else {
            nextP.push(key);
          }
        } else if (Array.isArray(resV) && resV.length >= 2) {
          // keep as-is if already has concrete url at end
          const last = resV[resV.length - 1];
          if (typeof last === "string" && !last.includes("$")) {
            entries[key] = resV;
            substMap[key] = last;
            localBlockSubst[key] = last;
          } else {
            nextP.push(key);
          }
        } else {
          nextP.push(key);
        }
      }
      pendingBlock = nextP;
    }

    // add any remaining block entries (partial)
    for (const key of pendingBlock) {
      const rawV = bdata.entries[key];
      const resV = resolveValWith(rawV, localBlockSubst);
      if (Array.isArray(resV) && resV.length >= 1) {
        const last = resV[resV.length - 1];
        if (typeof last === "string") {
          entries[key] = resV;
          substMap[key] = last;
        }
      }
    }
  }

  return entries;
}

/** Serialize simple meta object back to minimal TOML (for .__meta__.dy.toml) */
function simpleMetaToToml(metaObj) {
  const lines = [];
  for (const [key, val] of Object.entries(metaObj).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (typeof val === "string") {
      lines.push(`${key} = "${val.replace(/"/g, '\\"')}"`);
    } else if (Array.isArray(val)) {
      const items = val
        .map((v) => {
          if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
          return String(v);
        })
        .join(", ");
      lines.push(`${key} = [ ${items} ]`);
    }
  }
  return lines.join("\n") + "\n";
}

// Reuse original simple TOML parser (unchanged, now used on .dy.toml)
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

function resolveMarkdownSource(source, meta, mdFilePath = undefined) {
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

    // Block-level include: if the line is exactly [[filename]] or [[url|filename]] (after trim),
    // replace the whole line with the FULL resolved content of the target (recursive @@ + [[ ]],
    // head/tail blanks of include trimmed, internal structure 100% preserved).
    const lineTrimmedForInclude = line.trim();
    if (lineTrimmedForInclude.startsWith("[[") && lineTrimmedForInclude.endsWith("]]")) {
      const incRef = readIncludeRef(lineTrimmedForInclude, 0);
      if (incRef) {
        const resolvedInc = resolveIncludedContent(incRef.filename, mdFilePath);
        if (resolvedInc) {
          // resolvedInc already has leading/trailing blanks trimmed and inner syntax resolved
          resolvedInc.split(/\r?\n/).forEach((l) => out.push(l));
          continue;
        }
      }
    }

    const resolved = resolveInlineText(line, meta, mdFilePath);
    if (resolved.includes("\n")) {
      resolved.split(/\r?\n/).forEach((l) => out.push(l));
    } else {
      out.push(resolved);
    }
  }

  return out.join("\n");
}

/**
 * Replace @@key@@ , @@key[index]@@ and [[filename]] / [[url|filename]] 
 * outside inline backtick code spans. For [[ ]] inserts raw content of target file (preview only).
 */
function resolveInlineText(text, meta, currentMdPath = undefined) {
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
      const incRef = readIncludeRef(text, i);
      if (incRef) {
        let included = "";
        if (currentMdPath) {
          // Pure raw include: original file content exactly (only head/tail blanks trimmed).
          // For best structure preservation, put [[file.md]] on its own line.
          included = resolveIncludedContent(incRef.filename, currentMdPath) || "";
        }
        if (included) {
          out += included;
        } else {
          out += incRef.raw;
        }
        i = incRef.nextIndex;
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

function readIncludeRef(text, start) {
  const end = text.indexOf("]]", start + 2);
  if (end < 0) {
    return undefined;
  }

  const raw = text.slice(start, end + 2);
  const inner = text.slice(start + 2, end).trim();

  let filename = inner;
  const pipeIdx = inner.lastIndexOf("|");
  if (pipeIdx > 0) {
    filename = inner.slice(pipeIdx + 1).trim();
  }
  filename = filename.trim();

  if (!filename) {
    return undefined;
  }

  return {
    raw,
    filename,
    nextIndex: end + 2
  };
}

/**
 * Resolve an included Markdown file:
 * - Resolve path relative to current .md
 * - Read raw content
 * - Trim ONLY leading and trailing blank lines (preserve ALL internal structure, blank lines, formatting exactly as original)
 * - Recursively resolve its own @@...@@ and [[...]] using the INCLUDED file's nearest __meta__.toml
 * Returns the fully processed source string (newlines preserved) or null on failure.
 */
function resolveIncludedContent(filename, currentMdPath) {
  if (!currentMdPath || !filename) return null;
  try {
    let targetPath;
    if (path.isAbsolute(filename)) {
      targetPath = filename;
    } else {
      targetPath = path.resolve(path.dirname(currentMdPath), filename);
    }
    if (!fs.existsSync(targetPath)) return null;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) return null;

    let raw = fs.readFileSync(targetPath, "utf8");

    // Trim ONLY leading + trailing blank lines of the WHOLE included file.
    // Keep EVERY internal blank line, heading, list, code block, formatting exactly as original.
    // No @@ or [[ ]] processing inside included file — pure raw include.
    const lines = raw.split(/\r?\n/);
    let start = 0;
    while (start < lines.length && lines[start].trim() === "") start++;
    let end = lines.length;
    while (end > start && lines[end - 1].trim() === "") end--;
    return lines.slice(start, end).join("\n");
  } catch {
    return null;
  }
}

// Backwards compat alias (raw load, no resolve). Kept for any external use.
function loadIncludedMarkdown(filename, currentMdPath) {
  if (!currentMdPath || !filename) return null;
  try {
    let targetPath;
    if (path.isAbsolute(filename)) {
      targetPath = filename;
    } else {
      targetPath = path.resolve(path.dirname(currentMdPath), filename);
    }
    if (!fs.existsSync(targetPath)) return null;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) return null;
    return fs.readFileSync(targetPath, "utf8");
  } catch {
    return null;
  }
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
