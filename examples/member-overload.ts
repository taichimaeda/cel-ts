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
    "greet",
    FunctionOverload.member(
      "string_greet_string",
      [StringType, StringType],
      StringType,
      (lhs, rhs) =>
        new StringValue(
          `Hello ${String(rhs.value())}! Nice to meet you, I'm ${String(lhs.value())}.`
        )
    )
  )
);

const ast = env.compile("i.greet(you)");
const program = env.program(ast);
const result = program.eval({ i: "CEL", you: "world" });

console.log(String(result.value()));
