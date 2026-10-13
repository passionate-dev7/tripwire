// build-scenes.mjs : scenes/<name>.body + scenes/_base.txt -> scenes/<name>.html
import fs from "node:fs";
const dir = new URL("./scenes/", import.meta.url).pathname;
const base = fs.readFileSync(dir + "_base.txt", "utf8");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".body"))) {
  fs.writeFileSync(dir + f.replace(".body", ".html"), `<!doctype html>\n<meta charset="utf-8">\n${base}${fs.readFileSync(dir + f, "utf8")}`);
}
