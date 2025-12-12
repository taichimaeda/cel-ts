import * as cel from "../src/cel";

const env = new cel.Env({
  variables: [new cel.Variable("name", cel.StringType)],
});
const ast = env.compile(`"Hello world! I'm " + name + "."`);
const program = env.program(ast);

const result = program.eval({ name: "CEL" });
console.info(String(result.value()));
