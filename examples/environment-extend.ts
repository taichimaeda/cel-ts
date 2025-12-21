import { Env, IntType, Variable } from "../src/cel";

const base = new Env({
  variables: [new Variable("x", IntType)],
});

const extended = base.extend({
  variables: [new Variable("y", IntType)],
});

const ast = extended.compile("x + y * 2");
const program = extended.program(ast);

const result = program.eval({ x: 2n, y: 5n });
console.log(result.value());
