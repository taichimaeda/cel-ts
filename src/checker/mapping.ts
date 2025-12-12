// CEL Type Mapping
// Type parameter bindings for type unification and substitution

import { Type, TypeKind, typeKey } from "./types";

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
    this.bindings.set(typeKey(typeParam), boundType);
  }

  /**
   * Find a binding for a type parameter
   */
  find(typeParam: Type): Type | undefined {
    if (typeParam.kind !== TypeKind.TypeParam) {
      return undefined;
    }
    return this.bindings.get(typeKey(typeParam));
  }

  /**
   * Check if a type parameter is bound
   */
  has(typeParam: Type): boolean {
    if (typeParam.kind !== TypeKind.TypeParam) {
      return false;
    }
    return this.bindings.has(typeKey(typeParam));
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
}

/**
 * Check if two types are assignable with type parameter substitution
 * Updates the mapping with any new bindings discovered
 * Returns true if the assignment is valid
 */
export function isAssignableWithMapping(mapping: TypeMapping, target: Type, source: Type): boolean {
  const typeParamResult = handleTypeParamAssignment(mapping, target, source);
  if (typeParamResult !== undefined) {
    return typeParamResult;
  }

  if (isWildcardType(target) || isWildcardType(source)) {
    return true;
  }

  if (isNullAssignableToOptional(target, source)) {
    return true;
  }

  if (!haveCompatibleKinds(target, source)) {
    return false;
  }

  if (!namesMatchForStructuredTypes(target, source)) {
    return false;
  }

  return parametersAssignable(mapping, target, source);
}

/**
 * Check if typeParam occurs anywhere in type (for occurs check)
 */
function occursIn(typeParam: Type, type: Type): boolean {
  if (type.kind === TypeKind.TypeParam) {
    return typeKey(typeParam) === typeKey(type);
  }
  return type.parameters.some((p) => occursIn(typeParam, p));
}

function handleTypeParamAssignment(
  mapping: TypeMapping,
  target: Type,
  source: Type
): boolean | undefined {
  if (target.kind === TypeKind.TypeParam) {
    return bindTargetTypeParam(mapping, target, source);
  }
  if (source.kind === TypeKind.TypeParam) {
    return bindSourceTypeParam(mapping, target, source);
  }
  return undefined;
}

function bindTargetTypeParam(mapping: TypeMapping, target: Type, source: Type): boolean {
  const existing = mapping.find(target);
  if (existing) {
    return isAssignableWithMapping(mapping, existing, source);
  }
  if (occursIn(target, source)) {
    return false;
  }
  mapping.add(target, source);
  return true;
}

function bindSourceTypeParam(mapping: TypeMapping, target: Type, source: Type): boolean {
  const existing = mapping.find(source);
  if (existing) {
    return isAssignableWithMapping(mapping, target, existing);
  }
  if (occursIn(source, target)) {
    return false;
  }
  mapping.add(source, target);
  return true;
}

function isWildcardType(type: Type): boolean {
  return type.kind === TypeKind.Dyn || type.kind === TypeKind.Error;
}

function isNullAssignableToOptional(target: Type, source: Type): boolean {
  return source.kind === TypeKind.Null && target.isOptionalType();
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

function parametersAssignable(mapping: TypeMapping, target: Type, source: Type): boolean {
  for (let i = 0; i < target.parameters.length; i++) {
    const targetParam = target.parameters[i];
    const sourceParam = source.parameters[i];
    if (!(targetParam && sourceParam)) {
      return false;
    }
    if (!isAssignableWithMapping(mapping, targetParam, sourceParam)) {
      return false;
    }
  }
  return true;
}

function substituteTypeParam(type: Type, mapping: TypeMapping, typeParamToDyn: boolean): Type {
  const bound = mapping.find(type);
  if (bound) {
    return substitute(bound, mapping, typeParamToDyn);
  }
  return typeParamToDyn ? Type.Dyn : type;
}

function substituteList(type: Type, mapping: TypeMapping, typeParamToDyn: boolean): Type {
  const elem = type.parameters[0];
  if (!elem) {
    return type;
  }
  const newElem = substitute(elem, mapping, typeParamToDyn);
  return newElem === elem ? type : Type.newListType(newElem);
}

function substituteMap(type: Type, mapping: TypeMapping, typeParamToDyn: boolean): Type {
  const key = type.parameters[0];
  const val = type.parameters[1];
  if (!(key && val)) {
    return type;
  }
  const newKey = substitute(key, mapping, typeParamToDyn);
  const newVal = substitute(val, mapping, typeParamToDyn);
  return newKey === key && newVal === val ? type : Type.newMapType(newKey, newVal);
}

function substituteOpaque(type: Type, mapping: TypeMapping, typeParamToDyn: boolean): Type {
  if (type.parameters.length === 0) {
    return type;
  }
  let changed = false;
  const newParams = type.parameters.map((p) => {
    const newP = substitute(p, mapping, typeParamToDyn);
    if (newP !== p) {
      changed = true;
    }
    return newP;
  });
  return changed ? Type.newOpaqueType(type.runtimeTypeName, ...newParams) : type;
}

function substituteTypeWrapper(type: Type, mapping: TypeMapping, typeParamToDyn: boolean): Type {
  const param = type.parameters[0];
  if (!param) {
    return type;
  }
  const newParam = substitute(param, mapping, typeParamToDyn);
  return newParam === param ? type : Type.newTypeTypeWithParam(newParam);
}

/**
 * Substitute type parameters in a type based on the mapping
 * @param type The type to substitute in
 * @param mapping The type parameter bindings
 * @param typeParamToDyn If true, unbound type params become Dyn; if false, kept as-is
 */
export function substitute(type: Type, mapping: TypeMapping, typeParamToDyn = true): Type {
  switch (type.kind) {
    case TypeKind.TypeParam:
      return substituteTypeParam(type, mapping, typeParamToDyn);
    case TypeKind.List:
      return substituteList(type, mapping, typeParamToDyn);
    case TypeKind.Map:
      return substituteMap(type, mapping, typeParamToDyn);
    case TypeKind.Opaque:
      return substituteOpaque(type, mapping, typeParamToDyn);
    case TypeKind.Type:
      return substituteTypeWrapper(type, mapping, typeParamToDyn);
    default:
      return type;
  }
}

/**
 * Join two types to find their common type
 * Used for inferring element types in collections
 */
export function joinTypes(t1: Type, t2: Type): Type {
  // If either is Dyn or Error, result is Dyn
  if (t1.kind === TypeKind.Dyn || t1.kind === TypeKind.Error) {
    return Type.Dyn;
  }
  if (t2.kind === TypeKind.Dyn || t2.kind === TypeKind.Error) {
    return Type.Dyn;
  }

  // If types are equivalent, return one of them
  if (t1.isEquivalentType(t2)) {
    return t1;
  }

  // Otherwise, fall back to Dyn
  return Type.Dyn;
}
