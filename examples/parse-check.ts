import { Env, IntType, Types, Variable } from "../src/cel";

const env = new Env({
  variables: [new Variable("x", IntType), new Variable("items", Types.list(IntType))],
});

const parsed = env.parse("x in items && x > 0");
const checked = env.check(parsed);

console.log(checked.outputType?.toString());
