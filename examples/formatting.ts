import * as cel from "../src/cel";
import { Formatter } from "../src/formatter";

const env = new cel.Env({ disableTypeChecking: true });
const ast = env.parse("a && (b || c) ? x + y : z");

const formatter = new Formatter({ breakBinaryOperators: "logical", maxLineLength: 20 });
console.info(formatter.format(ast.ast));
