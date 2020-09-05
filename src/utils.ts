import * as protobuf from "protobufjs";
import {
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLString,
  GraphQLScalarType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLType,
  isScalarType,
  isEnumType,
} from "graphql";

const ScalarTypeMap = {
  double: GraphQLFloat,
  float: GraphQLFloat,
  int32: GraphQLInt,
  int64: GraphQLInt,
  uint32: GraphQLInt,
  uint64: GraphQLInt,
  sint32: GraphQLInt,
  sint64: GraphQLInt,
  fixed32: GraphQLInt,
  fixed64: GraphQLInt,
  sfixed32: GraphQLInt,
  sfixed64: GraphQLInt,
  bool: GraphQLBoolean,
  string: GraphQLString,
  bytes: GraphQLString,
};

export function sanitizeFieldName(name: string): string {
  return name.replace(/\W+/g, "_").replace(/^_/, "").replace(/_$/, "");
}

export function getFullTypeName(type: protobuf.ReflectionObject): string {
  if (type instanceof protobuf.MapField) {
    const keyType = convertScalar(type.keyType);
    const valueType = isScalar(type.type)
      ? convertScalar(type.type)
      : getFullTypeName(type.resolvedType);
    return `${keyType}_${valueType}_map`;
  }

  return type.parent && type.parent.name
    ? `${getFullTypeName(type.parent)}_${type.name}`
    : type.name;
}

export function isScalar(type: string) {
  return type in ScalarTypeMap;
}

export function convertScalar(type: string) {
  return (ScalarTypeMap as any)[type] as GraphQLScalarType;
}

export type FieldBehaviors = Set<string>;
export function getFieldBehaviors(field: protobuf.Field): FieldBehaviors {
  const fieldBehaviors = new Set<string>();

  // Incorrectly typed
  const parsedOptions = ((field.parsedOptions as any) ?? []) as Record<
    string,
    any
  >[];

  parsedOptions.forEach((options) => {
    Object.entries(options).forEach(([key, value]) => {
      if (key === "(google.api.field_behavior)") {
        fieldBehaviors.add(value);
      }
    });
  });

  return fieldBehaviors;
}

export function wrapType<T extends GraphQLType>(
  type: T,
  repeated: boolean,
  fieldBehaviors?: Set<string>
): T {
  let result: GraphQLType = type;

  if (repeated) {
    result = new GraphQLList(new GraphQLNonNull(result));
  }

  const requiredByDefault = isScalarType(result) || isEnumType(result);
  const required =
    fieldBehaviors?.has("REQUIRED") ||
    (requiredByDefault && !fieldBehaviors?.has("OPTIONAL"));
  if (required) {
    result = new GraphQLNonNull(result);
  }

  return result as T;
}
