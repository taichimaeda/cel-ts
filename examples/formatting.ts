import { Formatter } from "../src/formatter";

const formatter = new Formatter({ breakBinaryOperators: "logical", maxLineLength: 20 });
console.info(formatter.format("a && (b || c) ? x + y : z"));
