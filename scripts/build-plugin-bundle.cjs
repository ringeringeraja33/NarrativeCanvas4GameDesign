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
const app = fs.readFileSync(appPath, "utf8");

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
  throw new Error("main.js was not updated; bundle markers may be missing.");
}

fs.writeFileSync(mainPath, `${next.trimEnd()}\n`, "utf8");
