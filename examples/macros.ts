import * as cel from "../src";

const env = new cel.Env({
  variables: [new cel.Variable("nums", cel.Types.list(cel.IntType))],
});

const ast = env.compile("nums.exists(n, n % 2 == 0)");
const program = env.program(ast);

const result = program.eval({ nums: [1n, 3n, 4n] });
console.info(result.value());
