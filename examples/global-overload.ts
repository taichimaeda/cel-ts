import * as cel from "../src/cel";

const env = new cel.Env({
  variables: [new cel.Variable("i", cel.StringType), new cel.Variable("you", cel.StringType)],
  functions: [
    new cel.Function(
      "shake_hands",
      new cel.Overload(
        "shake_hands_string_string",
        [cel.StringType, cel.StringType],
        cel.StringType,
        (lhs, rhs) =>
          cel.StringValue.of(`${String(lhs.value())} and ${String(rhs.value())} are shaking hands.`)
      )
    ),
  ],
});

const ast = env.compile("shake_hands(i, you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.info(String(result.value()));
