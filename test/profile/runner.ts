import { DynType, Env, Variable } from "../../dist/index.js";
import type { ProfileCase } from "./cases.ts";

export class ProfileRunner {
  constructor(
    private readonly profileCases: ProfileCase[],
    private readonly iterations: number
  ) {}

  run(caseName?: string): void {
    const selectedCases = this.selectCases(caseName);
    const programs = selectedCases.map((profileCase) => {
      const variables = Object.entries(profileCase.environment ?? {}).map(
        ([name]) => new Variable(name, DynType)
      );
      const env = new Env({ variables });
      const ast = env.compile(profileCase.expr);
      const program = env.program(ast);
      return { profileCase, program };
    });

    let sink: unknown;
    for (const { profileCase, program } of programs) {
      for (let i = 0; i < this.iterations; i += 1) {
        sink = program.eval(profileCase.activation);
      }
    }

    if (sink === undefined) {
      throw new Error("unexpected undefined result");
    }
  }

  private selectCases(caseName?: string): ProfileCase[] {
    if (!caseName) {
      return this.profileCases;
    }
    return this.profileCases.filter((profileCase) => profileCase.name === caseName);
  }
}
