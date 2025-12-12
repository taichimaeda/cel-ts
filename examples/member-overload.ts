import { Env, Function, MemberOverload, StringType, StringValue, Variable } from "../src/cel";

const env = new Env(
  Variable("i", StringType),
  Variable("you", StringType),
  Function(
    "greet",
    MemberOverload(
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
