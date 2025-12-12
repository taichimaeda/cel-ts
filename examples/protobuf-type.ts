import * as protobuf from "protobufjs";
import * as cel from "../src/cel";

const root = protobuf.loadSync(["./protos/acme/person.proto"]);
const env = new cel.Env({
  typeProvider: new cel.ProtobufTypeProvider(root),
  variables: [new cel.Variable("person", cel.Types.object("acme.Person"))],
});

const ast = env.compile("person.name");
const program = env.program(ast);

const result = program.eval({ person: { name: "Ada" } });
console.info(result.value());
