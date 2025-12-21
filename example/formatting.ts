import { Env } from "../src/cel";
import { Formatter } from "../src/formatter";

const env = new Env({ disableTypeChecking: true });
const ast = env.parse("a && (b || c) ? x + y : z");

const formatter = new Formatter({ breakBinaryOperators: "logical" });
console.log(formatter.format(ast.ast));
