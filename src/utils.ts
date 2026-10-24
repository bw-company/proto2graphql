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

// Word characters only, not starting or ending with an underscore: the replacements below would not change it
const PLAIN_FIELD_NAME = /^[A-Za-z0-9](?:\w*[A-Za-z0-9])?$/;

export function sanitizeFieldName(name: string): string {
  if (PLAIN_FIELD_NAME.test(name)) return name;
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

// The (google.api.field_behavior) values this converter reacts to
export interface FieldBehaviors {
  readonly required: boolean;
  readonly optional: boolean;
  readonly inputOnly: boolean;
  readonly outputOnly: boolean;
}

const NO_FIELD_BEHAVIORS: FieldBehaviors = Object.freeze({
  required: false,
  optional: false,
  inputOnly: false,
  outputOnly: false,
});

const OPTIONAL_FIELD_BEHAVIORS: FieldBehaviors = Object.freeze({
  required: false,
  optional: true,
  inputOnly: false,
  outputOnly: false,
});

const FIELD_BEHAVIOR_OPTION = "(google.api.field_behavior)";

export function getFieldBehaviors(field: protobuf.Field): FieldBehaviors {
  // Incorrectly typed
  const parsedOptions = (field.parsedOptions as any) as
    | Record<string, any>[]
    | undefined;
  if (!parsedOptions || parsedOptions.length === 0) return NO_FIELD_BEHAVIORS;

  let required = false;
  let optional = false;
  let inputOnly = false;
  let outputOnly = false;
  let found = false;
  for (const options of parsedOptions) {
    for (const key in options) {
      if (key !== FIELD_BEHAVIOR_OPTION) continue;
      found = true;
      switch (options[key]) {
        case "REQUIRED":
          required = true;
          break;
        case "OPTIONAL":
          optional = true;
          break;
        case "INPUT_ONLY":
          inputOnly = true;
          break;
        case "OUTPUT_ONLY":
          outputOnly = true;
          break;
      }
    }
  }
  return found
    ? { required, optional, inputOnly, outputOnly }
    : NO_FIELD_BEHAVIORS;
}

export function asOptional(behaviors: FieldBehaviors): FieldBehaviors {
  if (!behaviors.required && behaviors.optional) return behaviors;
  if (!behaviors.inputOnly && !behaviors.outputOnly) return OPTIONAL_FIELD_BEHAVIORS;
  return { ...behaviors, required: false, optional: true };
}

export interface GenerateOption {
  skipOnType: boolean;
  skipOnInput: boolean;
  optionalOverrideEnabled: boolean;
}
export function getGenerateOption(field: protobuf.Field): GenerateOption {
  return {
    skipOnType: !!field.options?.["(proto2graphql.option).skip_on_type"],
    skipOnInput: !!field.options?.["(proto2graphql.option).skip_on_input"],
    optionalOverrideEnabled: !!field.options?.["(proto2graphql.option).optional_override_enabled"],
  };
}

export function wrapType<T extends GraphQLType>(
  type: T,
  repeated: boolean,
  fieldBehaviors?: FieldBehaviors
): T {
  let result: GraphQLType = type;

  if (repeated) {
    result = new GraphQLList(new GraphQLNonNull(result));
  }

  const requiredByDefault = isScalarType(result) || isEnumType(result);
  const required =
    fieldBehaviors?.required ||
    (requiredByDefault && !fieldBehaviors?.optional);
  if (required) {
    result = new GraphQLNonNull(result);
  }

  return result as T;
}
