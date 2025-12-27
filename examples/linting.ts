import { Linter } from "../src/linter";

const linter = new Linter();
const diagnostics = linter.lint("true || (x && false)");
for (const diagnostic of diagnostics) {
  const location = diagnostic.location
    ? `${diagnostic.location.line}:${diagnostic.location.column}`
    : "unknown";
  const fix = diagnostic.fix
    ? ` fix: ${diagnostic.fix.title} -> ${diagnostic.fix.replacement}`
    : "";
  console.info(`[${diagnostic.severity}] ${location} ${diagnostic.message}${fix}`);
}
