import * as protobuf from "protobufjs";
import * as cel from "../src";

const protoPath = decodeURIComponent(
  new URL("./protos/acme/person.proto", import.meta.url).pathname
);
const root = protobuf.loadSync([protoPath]);
const env = new cel.Env({
  typeProvider: new cel.ProtobufTypeProvider(root),
  variables: [new cel.Variable("person", new cel.StructType("acme.Person"))],
});

const ast = env.compile('"Hello, " + person.name + "!"');
const program = env.program(ast);

const result = program.eval({ person: { name: "Ada" } });
console.info(result.value());
