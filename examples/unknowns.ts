import * as cel from "../src/cel";

const env = new cel.Env({
  variables: [
    new cel.Variable("x", cel.BoolType),
    new cel.Variable("y", cel.BoolType),
  ],
});

const ast = env.compile("x && y");
const program = env.program(ast);

const baseActivation = new cel.MapActivation(
  new Map<string, cel.Value>([["y", cel.BoolValue.False]])
);
const partialActivation = new cel.PartialActivation(baseActivation, ["x"]);
const result = program.eval(partialActivation);

console.info("x unknown, y false:", result.value());

