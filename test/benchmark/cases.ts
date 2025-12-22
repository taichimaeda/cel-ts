import { Env } from "../../src/cel";
import { basicCases } from "./cases/basic";
import { collectionCases } from "./cases/collections";
import { stringCases } from "./cases/strings";

export type BenchCase = {
  name: string;
  expr: string;
  env: ConstructorParameters<typeof Env>[0];
  activation: Record<string, unknown>;
};

export type PreparedCase = BenchCase & {
  program: ReturnType<Env["program"]>;
};

export const cases: BenchCase[] = [...basicCases, ...collectionCases, ...stringCases];

export const prepareCase = (benchCase: BenchCase): PreparedCase => {
  const env = new Env(benchCase.env);
  const ast = env.compile(benchCase.expr);
  return { ...benchCase, program: env.program(ast) };
};

export const preparedCases = cases.map(prepareCase);
