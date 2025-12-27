import * as cel from "../src";

const env = new cel.Env({
  variables: [new cel.Variable("i", cel.StringType), new cel.Variable("you", cel.StringType)],
  functions: [
    new cel.Function(
      "greet",
      new cel.MemberOverload(
        "string_greet_string",
        [cel.StringType, cel.StringType],
        cel.StringType,
        (lhs, rhs) =>
          cel.StringValue.of(
            `Hello ${String(rhs.value())}! Nice to meet you, I'm ${String(lhs.value())}.`
          )
      )
    ),
  ],
});

const ast = env.compile("i.greet(you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.info(String(result.value()));
