import { Env, Function, Overload, StringType, StringValue, Variable } from "../src/cel";

const env = new Env({
  variables: [new Variable("i", StringType), new Variable("you", StringType)],
  functions: [
    new Function(
      "shake_hands",
      new Overload(
        "shake_hands_string_string",
        [StringType, StringType],
        StringType,
        (lhs, rhs) =>
          new StringValue(`${String(lhs.value())} and ${String(rhs.value())} are shaking hands.`)
      )
    ),
  ],
});

const ast = env.compile("shake_hands(i, you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.log(String(result.value()));
