import type { AST } from "../common/ast";
import type { Interpretable } from "../interpreter/interpretable";
import { ConstantCallFoldPass } from "./passes/constant-call-fold";
import { ConstantCondFoldPass } from "./passes/constant-cond-fold";
import { NoOpConversionFoldPass } from "./passes/noop-conversion-fold";

/**
 * Pre-plan optimizer pass that rewrites AST nodes.
 */
export interface PreOptimizerPass {
  /**
   * Apply this pass to the AST.
   */
  run(ast: AST): AST;
}

/**
 * PreOptimizer applies a sequence of optimization passes to an AST.
 */
export class PreOptimizer {
  private readonly passes: PreOptimizerPass[];

  constructor(passes: PreOptimizerPass[] = AllPrePasses) {
    this.passes = passes;
  }

  /**
   * Run the configured passes in order.
   */
  optimize(ast: AST): AST {
    return this.passes.reduce((current, pass) => pass.run(current), ast);
  }
}

/**
 * Post-plan optimizer pass that rewrites interpretable nodes.
 */
export interface PostOptimizerPass {
  /**
   * Apply this pass to the Interpretable tree.
   */
  run(root: Interpretable): Interpretable;
}

/**
 * PostOptimizer applies a sequence of optimization passes to an Interpretable.
 */
export class PostOptimizer {
  private readonly passes: PostOptimizerPass[];

  constructor(passes: PostOptimizerPass[] = AllPostPasses) {
    this.passes = passes;
  }

  /**
   * Run the configured passes in order.
   */
  optimize(root: Interpretable): Interpretable {
    return this.passes.reduce((current, pass) => pass.run(current), root);
  }
}

/**
 * Default pre-plan optimizer pass pipeline.
 */
export const AllPrePasses: PreOptimizerPass[] = [
  new ConstantCallFoldPass(),
  new ConstantCondFoldPass(),
];

/**
 * Default post-plan optimizer pass pipeline.
 */
export const AllPostPasses: PostOptimizerPass[] = [new NoOpConversionFoldPass()];
