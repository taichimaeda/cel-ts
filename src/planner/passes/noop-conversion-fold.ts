// Post-plan optimizer pass
// Remove no-op type conversions when the operand already matches the target type.

import {
  AndValue,
  AttrValue,
  BinaryValue,
  BlockValue,
  CallValue,
  ComprehensionValue,
  ConditionalValue,
  ConstValue,
  CreateListValue,
  CreateMapValue,
  CreateStructValue,
  FieldValue,
  HasFieldValue,
  IdentValue,
  IndexValue,
  type Interpretable,
  NegValue,
  NotStrictlyFalseValue,
  NotValue,
  OrValue,
  TypeConversionValue,
} from "../../interpreter/interpretable";
import {
  BoolValue,
  BytesValue,
  DoubleValue,
  IntValue,
  StringValue,
  UintValue,
  type Value,
} from "../../interpreter/values";
import type { PostOptimizerPass } from "../optimizer";

/**
 * Post-plan pass that removes redundant type conversions.
 */
export class NoOpConversionFoldPass implements PostOptimizerPass {
  /**
   * Fold no-op type conversions when the operand is a constant of the target type.
   *
   * @example
   * ```ts
   * // string("a") -> "a"
   * // int(1) -> 1
   * ```
   */
  run(root: Interpretable): Interpretable {
    return this.rewrite(root);
  }

  private rewrite(node: Interpretable): Interpretable {
    if (node instanceof ConstValue) {
      return node;
    }
    if (node instanceof IdentValue) {
      return node;
    }
    if (node instanceof AttrValue) {
      return node;
    }
    if (node instanceof NotValue) {
      const operand = this.rewrite(node.operandValue());
      return operand === node.operandValue() ? node : new NotValue(node.id(), operand);
    }
    if (node instanceof NotStrictlyFalseValue) {
      const operand = this.rewrite(node.operandValue());
      return operand === node.operandValue() ? node : new NotStrictlyFalseValue(node.id(), operand);
    }
    if (node instanceof NegValue) {
      const operand = this.rewrite(node.operandValue());
      return operand === node.operandValue() ? node : new NegValue(node.id(), operand);
    }
    if (node instanceof AndValue) {
      const left = this.rewrite(node.left());
      const right = this.rewrite(node.right());
      if (left === node.left() && right === node.right()) {
        return node;
      }
      return new AndValue(node.id(), left, right);
    }
    if (node instanceof OrValue) {
      const left = this.rewrite(node.left());
      const right = this.rewrite(node.right());
      if (left === node.left() && right === node.right()) {
        return node;
      }
      return new OrValue(node.id(), left, right);
    }
    if (node instanceof ConditionalValue) {
      const condition = this.rewrite(node.conditionValue());
      const truthy = this.rewrite(node.truthyValue());
      const falsy = this.rewrite(node.falsyValue());
      if (
        condition === node.conditionValue() &&
        truthy === node.truthyValue() &&
        falsy === node.falsyValue()
      ) {
        return node;
      }
      return new ConditionalValue(node.id(), condition, truthy, falsy);
    }
    if (node instanceof BinaryValue) {
      const left = this.rewrite(node.left());
      const right = this.rewrite(node.right());
      if (left === node.left() && right === node.right()) {
        return node;
      }
      return new BinaryValue(node.id(), node.operatorName(), left, right);
    }
    if (node instanceof CallValue) {
      const args = this.rewriteList(node.argList());
      if (args === node.argList()) {
        return node;
      }
      return new CallValue(
        node.id(),
        node.name(),
        node.overload(),
        args,
        node.overloadDispatcher()
      );
    }
    if (node instanceof BlockValue) {
      const slots = this.rewriteList(node.slotValues());
      const result = this.rewrite(node.resultValue());
      if (slots === node.slotValues() && result === node.resultValue()) {
        return node;
      }
      return new BlockValue(node.id(), slots, result);
    }
    if (node instanceof CreateListValue) {
      const elements = this.rewriteList(node.elementValues());
      if (elements === node.elementValues()) {
        return node;
      }
      return new CreateListValue(node.id(), elements, node.optionalIndexList());
    }
    if (node instanceof CreateMapValue) {
      const keys = this.rewriteList(node.keyExpressions());
      const values = this.rewriteList(node.valueExpressions());
      if (keys === node.keyExpressions() && values === node.valueExpressions()) {
        return node;
      }
      return new CreateMapValue(node.id(), keys, values, node.optionalIndexList());
    }
    if (node instanceof CreateStructValue) {
      const values = this.rewriteList(node.valueExpressions());
      if (values === node.valueExpressions()) {
        return node;
      }
      return new CreateStructValue(
        node.id(),
        node.typeName,
        node.fieldNames(),
        values,
        node.fieldTypeMap(),
        node.optionalFieldIndices(),
        node.provider()
      );
    }
    if (node instanceof IndexValue) {
      const operand = this.rewrite(node.operandValue());
      const index = this.rewrite(node.indexValue());
      if (operand === node.operandValue() && index === node.indexValue()) {
        return node;
      }
      return new IndexValue(node.id(), operand, index, node.isOptional());
    }
    if (node instanceof FieldValue) {
      const operand = this.rewrite(node.operandValue());
      if (operand === node.operandValue()) {
        return node;
      }
      return new FieldValue(node.id(), operand, node.fieldName(), node.isOptional());
    }
    if (node instanceof HasFieldValue) {
      const operand = this.rewrite(node.operandValue());
      if (operand === node.operandValue()) {
        return node;
      }
      return new HasFieldValue(node.id(), operand, node.fieldName());
    }
    if (node instanceof ComprehensionValue) {
      const iterRange = this.rewrite(node.iterationRange());
      const accuInit = this.rewrite(node.accumulatorInit());
      const loopCondition = this.rewrite(node.loopConditionValue());
      const loopStep = this.rewrite(node.loopStepValue());
      const result = this.rewrite(node.resultValue());
      if (
        iterRange === node.iterationRange() &&
        accuInit === node.accumulatorInit() &&
        loopCondition === node.loopConditionValue() &&
        loopStep === node.loopStepValue() &&
        result === node.resultValue()
      ) {
        return node;
      }
      return new ComprehensionValue(
        node.id(),
        node.iterationVariable(),
        iterRange,
        node.accumulatorVariable(),
        accuInit,
        loopCondition,
        loopStep,
        result,
        node.iterationVariable2()
      );
    }
    if (node instanceof TypeConversionValue) {
      const operand = this.rewrite(node.operandValue());
      const targetType = node.targetTypeName();

      if (operand instanceof ConstValue) {
        const value = operand.value();
        if (this.isNoOpConversion(value, targetType)) {
          return operand;
        }
      }

      return operand === node.operandValue()
        ? node
        : new TypeConversionValue(node.id(), operand, targetType, node.provider());
    }

    return node;
  }

  private isNoOpConversion(value: Value, targetType: string): boolean {
    if (targetType === "type") {
      return false;
    }
    switch (targetType) {
      case "bool":
        return value instanceof BoolValue;
      case "int":
        return value instanceof IntValue;
      case "uint":
        return value instanceof UintValue;
      case "double":
        return value instanceof DoubleValue;
      case "string":
        return value instanceof StringValue;
      case "bytes":
        return value instanceof BytesValue;
      case "dyn":
        return true;
      default:
        return false;
    }
  }

  private rewriteList(nodes: Interpretable[]): Interpretable[] {
    let changed = false;
    const rewritten = nodes.map((node) => {
      const next = this.rewrite(node);
      if (next !== node) {
        changed = true;
      }
      return next;
    });
    return changed ? rewritten : nodes;
  }
}
