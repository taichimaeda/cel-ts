import * as cel from "../src";

const env = new cel.Env({
  structs: [
    new cel.EnvStructOption("Person", {
      name: cel.StringType,
      age: cel.IntType,
    }),
  ],
  variables: [new cel.Variable("person", new cel.StructType("Person"))],
});

const ast = env.compile("person.age >= 21 && person.name != ''");
const program = env.program(ast);

const result = program.eval({ person: { name: "Ada", age: 36n } });
console.info(result.value());
