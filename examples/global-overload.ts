import {
  Env,
  EnvFunction,
  EnvVariable,
  GlobalFunctionOverload,
  StringType,
  StringValue,
} from "../src/cel";

const env = new Env({
  variables: [new EnvVariable("i", StringType), new EnvVariable("you", StringType)],
  functions: [
    new EnvFunction(
      "shake_hands",
      new GlobalFunctionOverload(
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
