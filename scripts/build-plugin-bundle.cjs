const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const mainPath = path.join(projectRoot, "main.js");
const indexPath = path.join(projectRoot, "index.html");
const appPath = path.join(projectRoot, "app.js");

function jsStringLine(line) {
  return JSON.stringify(line)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function buildIndexConstant(html) {
  const lines = html.replace(/\r\n/g, "\n").trimEnd().split("\n");
  return [
    "const CANVAS_INDEX_HTML = [",
    ...lines.map((line) => `  ${jsStringLine(line)},`),
    "].join(\"\\n\");"
  ].join("\n");
}

function indentAppSource(source) {
  return source
    .replace(/\r\n/g, "\n")
    .trimEnd()
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
}

const main = fs.readFileSync(mainPath, "utf8").replace(/\r\n/g, "\n");
const html = fs.readFileSync(indexPath, "utf8");
const rawApp = fs.readFileSync(appPath, "utf8");

// Strip the web-only localStorage branch out of getWebProjectStorage when bundling
// into the Obsidian plugin entry, so main.js doesn't ship any localStorage references.
// The standalone app.js keeps the real implementation for the browser build.
const app = rawApp.replace(
  /function getWebProjectStorage\(\) \{[\s\S]*?\n\}/,
  `function getWebProjectStorage() {
  // Obsidian-plugin bundle: persistence runs through NarrativeCanvasHost, no browser storage.
  return null;
}`
);
if (app === rawApp) {
  throw new Error("getWebProjectStorage not found in app.js for plugin-bundle rewrite.");
}

let next = main.replace(
  /const CANVAS_INDEX_HTML = \[[\s\S]*?\]\.join\("\\n"\);/,
  buildIndexConstant(html)
);

const appStartMarker = "function installNarrativeCanvasApp() {\n  // BEGIN bundled app.js\n";
const appEndMarker = "\n  // END bundled app.js\n}";
const appStart = next.indexOf(appStartMarker);
if (appStart === -1) {
  throw new Error("Could not find bundled app start marker.");
}
const appBodyStart = appStart + appStartMarker.length;
const appEnd = next.indexOf(appEndMarker, appBodyStart);
if (appEnd === -1) {
  throw new Error("Could not find bundled app end marker.");
}
next = `${next.slice(0, appBodyStart)}${indentAppSource(app)}${next.slice(appEnd)}`;

if (next === main) {
  process.exit(0);
}

fs.writeFileSync(mainPath, `${next.trimEnd()}\n`, "utf8");
