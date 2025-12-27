import * as cel from "../src";

const env = new cel.Env({
  variables: [
    new cel.Variable("x", cel.IntType),
    new cel.Variable("items", new cel.ListType(cel.IntType)),
  ],
});

const parsed = env.parse("x in items && x > 0");
const checked = env.check(parsed);

console.info(checked.outputType?.toString());
