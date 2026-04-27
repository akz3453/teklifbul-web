// Teklifbul Rule v1.0
// Extract disabled legacy inline script from demand-new.html into an external module.
import fs from "node:fs";
import path from "node:path";

const htmlPath = path.resolve(process.cwd(), "demand-new.html");
const html = fs.readFileSync(htmlPath, "utf8");

const startToken = '<script type="text/plain" data-teklifbul-disabled="true">';
const endToken = "</script>";

const startIdx = html.indexOf(startToken);
if (startIdx < 0) {
  throw new Error(`startToken not found: ${startToken}`);
}

const from = startIdx + startToken.length;
const endIdx = html.indexOf(endToken, from);
if (endIdx < 0) {
  throw new Error("endToken not found after startToken");
}

let code = html.slice(from, endIdx);
code = code.replace(/^\s*\n/, ""); // trim first blank line if any

// Convert relative imports (written for HTML root) to absolute imports
// because this file will live under /assets/js/.
const fixes = [
  [/"\.\/firebase\.js"/g, '"/firebase.js"'],
  [/"\.\/src\//g, '"/src/'],
  [/"\.\/categories\.js"/g, '"/categories.js"'],
  [/"\.\/utils\//g, '"/utils/'],
  [/"\.\/assets\//g, '"/assets/'],
  [/'\.\/firebase\.js'/g, "'/firebase.js'"],
  [/'\.\/src\//g, "'/src/"],
  [/'\.\/categories\.js'/g, "'/categories.js'"],
  [/'\.\/utils\//g, "'/utils/"],
  [/'\.\/assets\//g, "'/assets/"],
];
for (const [re, rep] of fixes) code = code.replace(re, rep);

const outPath = path.resolve(process.cwd(), "assets/js/demand-new-legacy.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, code, "utf8");

console.log(`Extracted legacy script: ${code.length} chars -> ${outPath}`);


