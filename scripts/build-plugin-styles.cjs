const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "canvas.css");
const targetPath = path.join(projectRoot, "styles.css");
const hostSelector = ".narrative-canvas-plugin-host";
const marker = "/* Narrative Canvas web app styles (scoped; generated from canvas.css) */";

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(hostSelector)) return trimmed;
  if (trimmed === ":root") return hostSelector;
  if (trimmed.startsWith(":root[")) {
    return `${hostSelector} .app-shell${trimmed.slice(":root".length)}`;
  }
  if (trimmed === "html" || trimmed === "body") return hostSelector;
  return `${hostSelector} ${trimmed}`;
}

function scopeSelectorList(selectorText) {
  return selectorText
    .split(",")
    .map(scopeSelector)
    .filter(Boolean)
    .join(", ");
}

function scopeCss(source) {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const openIndex = source.indexOf("{", cursor);
    if (openIndex === -1) {
      output += source.slice(cursor);
      break;
    }
    const prelude = source.slice(cursor, openIndex);
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex === -1) {
      output += source.slice(cursor);
      break;
    }
    const body = source.slice(openIndex + 1, closeIndex);
    const trimmedPrelude = prelude.trim();
    const leading = prelude.slice(0, prelude.indexOf(trimmedPrelude));
    if (trimmedPrelude.startsWith("@")) {
      if (/^@(media|supports|container)\b/.test(trimmedPrelude)) {
        output += `${leading}${trimmedPrelude} {\n${scopeCss(body).trim()}\n}`;
      } else {
        output += `${prelude}{${body}}`;
      }
    } else {
      output += `${leading}${scopeSelectorList(trimmedPrelude)} {${body}}`;
    }
    cursor = closeIndex + 1;
  }
  return output;
}

const current = fs.readFileSync(targetPath, "utf8").replace(/\r\n/g, "\n");
const markerIndex = current.indexOf(marker);
if (markerIndex === -1) {
  throw new Error(`Could not find marker in ${targetPath}`);
}

const prelude = current.slice(0, markerIndex + marker.length).trimEnd();
const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const scoped = scopeCss(source).trim();
fs.writeFileSync(targetPath, `${prelude}\n${scoped}\n`, "utf8");
