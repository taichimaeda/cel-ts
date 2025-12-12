import {
  Env,
  Function,
  GlobalOverload,
  StringType,
  StringValue,
  type Value,
  Variable,
} from "../src/cel";

const env = new Env(
  Variable("i", StringType),
  Variable("you", StringType),
  Function(
    "shake_hands",
    GlobalOverload(
      "shake_hands_string_string",
      [StringType, StringType],
      StringType,
      (args: Value[]) =>
        new StringValue(
          `${String(args[0].value())} and ${String(args[1].value())} are shaking hands.`
        )
    )
  )
);

const ast = env.compile("shake_hands(i, you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.log(String(result.value()));
