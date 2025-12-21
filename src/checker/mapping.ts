// CEL Type Mapping
// Type parameter bindings for type unification and substitution

import {
  DynType,
  ListType,
  MapType,
  OpaqueType,
  Type,
  TypeKind,
  TypeTypeWithParam,
  wellKnownTypeToNative,
  wrapperTypeToPrimitive,
} from "./types";

/**
 * Type parameter mapping for tracking substitutions during type inference
 */
export class TypeMapping {
  private readonly bindings: Map<string, Type> = new Map();

  /**
   * Add a type binding
   */
  add(typeParam: Type, boundType: Type): void {
    if (typeParam.kind !== TypeKind.TypeParam) {
      return;
    }
    this.bindings.set(typeParam.typeKey(), boundType);
  }

  /**
   * Find a binding for a type parameter
   */
  find(typeParam: Type): Type | undefined {
    if (typeParam.kind !== TypeKind.TypeParam) {
      return undefined;
    }
    return this.bindings.get(typeParam.typeKey());
  }

  /**
   * Check if a type parameter is bound
   */
  has(typeParam: Type): boolean {
    if (typeParam.kind !== TypeKind.TypeParam) {
      return false;
    }
    return this.bindings.has(typeParam.typeKey());
  }

  /**
   * Create an independent copy of this mapping
   * Used for backtracking during overload resolution
   */
  copy(): TypeMapping {
    const newMapping = new TypeMapping();
    for (const [key, value] of this.bindings) {
      newMapping.bindings.set(key, value);
    }
    return newMapping;
  }

  /**
   * Get all bindings
   */
  entries(): IterableIterator<[string, Type]> {
    return this.bindings.entries();
  }

  /**
   * Check if two types are assignable with this mapping context.
   */
  isAssignable(target: Type, source: Type): boolean {
    const typeParamResult = this.bindTypeParam(target, source);
    if (typeParamResult !== undefined) {
      return typeParamResult;
    }

    const targetWrapper = wrapperTypeToPrimitive(target);
    const sourceWrapper = wrapperTypeToPrimitive(source);
    if (targetWrapper || sourceWrapper) {
      return this.isAssignable(targetWrapper ?? target, sourceWrapper ?? source);
    }

    const targetWellKnown = wellKnownTypeToNative(target);
    const sourceWellKnown = wellKnownTypeToNative(source);
    if (targetWellKnown || sourceWellKnown) {
      return this.isAssignable(targetWellKnown ?? target, sourceWellKnown ?? source);
    }

    if (target.kind === TypeKind.Int && isEnumType(source)) {
      return true;
    }

    if (isWildcardType(target) || isWildcardType(source)) {
      return true;
    }
    if (isNullAssignableToOptional(target, source)) {
      return true;
    }
    if (isNullAssignableToReference(target, source)) {
      return true;
    }
    if (!haveCompatibleKinds(target, source)) {
      return false;
    }
    if (!namesMatchForStructuredTypes(target, source)) {
      return false;
    }

    for (let i = 0; i < target.parameters.length; i++) {
      const targetParam = target.parameters[i];
      const sourceParam = source.parameters[i];
      if (!(targetParam && sourceParam)) {
        return false;
      }
      if (!this.isAssignable(targetParam, sourceParam)) {
        return false;
      }
    }
    return true;
  }

  private bindTypeParam(target: Type, source: Type): boolean | undefined {
    if (target.kind === TypeKind.TypeParam) {
      return this.bindTargetTypeParam(target, source);
    }
    if (source.kind === TypeKind.TypeParam) {
      return this.bindSourceTypeParam(target, source);
    }
    return undefined;
  }

  private bindTargetTypeParam(target: Type, source: Type): boolean {
    const existing = this.find(target);
    if (existing) {
      return this.isAssignable(existing, source);
    }
    if (source.kind === TypeKind.TypeParam && source.typeKey() === target.typeKey()) {
      return true;
    }
    if (occursIn(target, source)) {
      return false;
    }
    this.add(target, source);
    return true;
  }

  private bindSourceTypeParam(target: Type, source: Type): boolean {
    const existing = this.find(source);
    if (existing) {
      return this.isAssignable(target, existing);
    }
    if (target.kind === TypeKind.TypeParam && target.typeKey() === source.typeKey()) {
      return true;
    }
    if (occursIn(source, target)) {
      return false;
    }
    this.add(source, target);
    return true;
  }

  /**
   * Substitute type parameters in the given type using this mapping.
   */
  substitute(type: Type, typeParamToDyn = true): Type {
    return this.substituteType(type, typeParamToDyn);
  }

  private substituteType(type: Type, typeParamToDyn: boolean): Type {
    switch (type.kind) {
      case TypeKind.TypeParam:
        return this.substituteTypeParam(type, typeParamToDyn);
      case TypeKind.List:
        return this.substituteList(type, typeParamToDyn);
      case TypeKind.Map:
        return this.substituteMap(type, typeParamToDyn);
      case TypeKind.Opaque:
        return this.substituteOpaque(type, typeParamToDyn);
      case TypeKind.Type:
        return this.substituteTypeWrapper(type, typeParamToDyn);
      default:
        return type;
    }
  }

  private substituteTypeParam(type: Type, typeParamToDyn: boolean): Type {
    const bound = this.find(type);
    if (bound) {
      return this.substituteType(bound, typeParamToDyn);
    }
    return typeParamToDyn ? DynType : type;
  }

  private substituteList(type: Type, typeParamToDyn: boolean): Type {
    const elem = type.parameters[0];
    if (!elem) {
      return type;
    }
    const newElem = this.substituteType(elem, typeParamToDyn);
    return newElem === elem ? type : new ListType(newElem);
  }

  private substituteMap(type: Type, typeParamToDyn: boolean): Type {
    const key = type.parameters[0];
    const val = type.parameters[1];
    if (!(key && val)) {
      return type;
    }
    const newKey = this.substituteType(key, typeParamToDyn);
    const newVal = this.substituteType(val, typeParamToDyn);
    return newKey === key && newVal === val ? type : new MapType(newKey, newVal);
  }

  private substituteOpaque(type: Type, typeParamToDyn: boolean): Type {
    if (type.parameters.length === 0) {
      return type;
    }
    let changed = false;
    const newParams = type.parameters.map((p) => {
      const newP = this.substituteType(p, typeParamToDyn);
      if (newP !== p) {
        changed = true;
      }
      return newP;
    });
    return changed ? new OpaqueType(type.runtimeTypeName, ...newParams) : type;
  }

  private substituteTypeWrapper(type: Type, typeParamToDyn: boolean): Type {
    const param = type.parameters[0];
    if (!param) {
      return type;
    }
    const newParam = this.substituteType(param, typeParamToDyn);
    return newParam === param ? type : new TypeTypeWithParam(newParam);
  }
}

function occursIn(typeParam: Type, type: Type): boolean {
  if (type.kind === TypeKind.TypeParam) {
    return typeParam.typeKey() === type.typeKey();
  }
  return type.parameters.some((p) => occursIn(typeParam, p));
}

function isWildcardType(type: Type): boolean {
  return type.kind === TypeKind.Dyn || type.kind === TypeKind.Error;
}

function isNullAssignableToOptional(target: Type, source: Type): boolean {
  return source.kind === TypeKind.Null && target.isOptionalType();
}

function isNullAssignableToReference(target: Type, source: Type): boolean {
  if (source.kind !== TypeKind.Null) {
    return false;
  }
  switch (target.kind) {
    case TypeKind.Struct:
    case TypeKind.Duration:
    case TypeKind.Timestamp:
      return true;
    default:
      return false;
  }
}

function isEnumType(type: Type): boolean {
  return (
    type.kind === TypeKind.Opaque &&
    type.runtimeTypeName !== "optional_type" &&
    type.parameters.length === 0
  );
}

function haveCompatibleKinds(target: Type, source: Type): boolean {
  return target.kind === source.kind && target.parameters.length === source.parameters.length;
}

function namesMatchForStructuredTypes(target: Type, source: Type): boolean {
  if (target.kind === TypeKind.Struct || target.kind === TypeKind.Opaque) {
    return target.runtimeTypeName === source.runtimeTypeName;
  }
  return true;
}
