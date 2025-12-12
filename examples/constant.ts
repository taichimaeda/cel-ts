import * as cel from "../src/cel";

// Constants are compile-time values that are folded into the AST
// Unlike variables, they don't need to be provided at evaluation time

const env = new cel.Env({
  constants: [
    new cel.Constant("VERSION", cel.StringType, cel.StringValue.of("1.0.0")),
    new cel.Constant("MAX_RETRIES", cel.IntType, cel.IntValue.of(3n)),
  ],
  variables: [new cel.Variable("retryCount", cel.IntType)],
});

// Compile expression using constants
const ast = env.compile(`retryCount < MAX_RETRIES ? "retry" : "give up (v" + VERSION + ")"`);
const program = env.program(ast);

// Constants don't need to be provided at eval time - they're already folded
console.info("retryCount=1:", String(program.eval({ retryCount: 1n }).value()));
console.info("retryCount=5:", String(program.eval({ retryCount: 5n }).value()));
