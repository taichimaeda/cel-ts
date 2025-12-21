import { Env, EnvStructOption, IntType, StringType, Types, Variable } from "../src/cel";

const env = new Env({
  structs: [
    new EnvStructOption("Person", {
      name: StringType,
      age: IntType,
    }),
  ],
  variables: [new Variable("person", Types.object("Person"))],
});

const ast = env.compile("person.age >= 21 && person.name != ''");
const program = env.program(ast);

const result = program.eval({ person: { name: "Ada", age: 36n } });
console.log(result.value());
