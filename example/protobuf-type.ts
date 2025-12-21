import * as protobuf from "protobufjs";
import { Env, ProtobufTypeProvider, Types, Variable } from "../src/cel";

const root = protobuf.loadSync(["./protos/acme/person.proto"]);
const env = new Env({
  typeProvider: new ProtobufTypeProvider(root),
  variables: [new Variable("person", Types.object("acme.Person"))],
});

const ast = env.compile("person.name");
const program = env.program(ast);

const result = program.eval({ person: { name: "Ada" } });
console.log(result.value());
