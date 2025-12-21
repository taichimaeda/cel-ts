import { Env, IntType, Types, Variable } from "../src/cel";

const env = new Env({
  variables: [new Variable("nums", Types.list(IntType))],
});

const ast = env.compile("nums.exists(n, n % 2 == 0)");
const program = env.program(ast);

const result = program.eval({ nums: [1n, 3n, 4n] });
console.log(result.value());
