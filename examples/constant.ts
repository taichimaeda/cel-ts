import { Constant, Env, IntType, IntValue, StringType, StringValue, Variable } from "../src/cel";

// Constants are compile-time values that are folded into the AST
// Unlike variables, they don't need to be provided at evaluation time

const env = new Env({
  constants: [
    new Constant("VERSION", StringType, StringValue.of("1.0.0")),
    new Constant("MAX_RETRIES", IntType, IntValue.of(3n)),
  ],
  variables: [new Variable("retryCount", IntType)],
});

// Compile expression using constants
const ast = env.compile(`retryCount < MAX_RETRIES ? "retry" : "give up (v" + VERSION + ")"`);
const program = env.program(ast);

// Constants don't need to be provided at eval time - they're already folded
console.log("retryCount=1:", String(program.eval({ retryCount: 1n }).value()));
console.log("retryCount=5:", String(program.eval({ retryCount: 5n }).value()));
