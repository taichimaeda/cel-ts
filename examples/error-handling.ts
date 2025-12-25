import { CompileError, Env, IntType, ParseError, Variable } from "../src/cel";

const env = new Env({
  variables: [new Variable("x", IntType)],
});

try {
  env.compile("x +");
} catch (err) {
  if (err instanceof ParseError) {
    console.log("Parse error:", err.message);
  }
}

try {
  env.compile("x + 'oops'");
} catch (err) {
  if (err instanceof CompileError) {
    console.log("Type error:", err.message);
    console.log("Issues:", err.issues.toString());
  }
}
