import * as cel from "../src";

const base = new cel.Env({
  variables: [new cel.Variable("x", cel.IntType)],
});

const extended = base.extend({
  variables: [new cel.Variable("y", cel.IntType)],
});

const ast = extended.compile("x + y * 2");
const program = extended.program(ast);

const result = program.eval({ x: 2n, y: 5n });
console.info(result.value());
