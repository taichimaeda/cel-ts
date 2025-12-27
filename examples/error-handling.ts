import * as cel from "../src/cel";

const env = new cel.Env({
  variables: [new cel.Variable("x", cel.IntType)],
});

try {
  env.compile("x +");
} catch (err) {
  if (err instanceof cel.ParseError) {
    console.info("Parse error:", err.message);
  }
}

try {
  env.compile('x + "oops"');
} catch (err) {
  if (err instanceof cel.CompileError) {
    console.info("Type error:", err.message);
    console.info("Issues:", err.issues.toString());
  }
}
