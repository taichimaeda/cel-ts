import { Env, StringType, Variable } from "../src/cel";

const env = new Env({
  variables: [new Variable("name", StringType)],
});
const ast = env.compile(`"Hello world! I'm " + name + "."`);
const program = env.program(ast);

const result = program.eval({ name: "CEL" });
console.log(String(result.value()));
