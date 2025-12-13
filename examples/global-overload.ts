import {
  Env,
  FunctionOption,
  FunctionOverload,
  StringType,
  StringValue,
  VariableOption,
} from "../src/cel";

const env = new Env(
  new VariableOption("i", StringType),
  new VariableOption("you", StringType),
  new FunctionOption(
    "shake_hands",
    FunctionOverload.global(
      "shake_hands_string_string",
      [StringType, StringType],
      StringType,
      (lhs, rhs) =>
        new StringValue(
          `${String(lhs.value())} and ${String(rhs.value())} are shaking hands.`
        )
    )
  )
);

const ast = env.compile("shake_hands(i, you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.log(String(result.value()));
