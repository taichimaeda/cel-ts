import * as cel from "../src/cel";
import { Linter } from "../src/linter";

const env = new cel.Env({ disableTypeChecking: true });
const ast = env.parse("true || (x && false)");

const linter = new Linter();
const diagnostics = linter.lint(ast.ast);
for (const diagnostic of diagnostics) {
  const location = diagnostic.location
    ? `${diagnostic.location.line}:${diagnostic.location.column}`
    : "unknown";
  const fix = diagnostic.fix
    ? ` fix: ${diagnostic.fix.title} -> ${diagnostic.fix.replacement}`
    : "";
  console.info(`[${diagnostic.severity}] ${location} ${diagnostic.message}${fix}`);
}
