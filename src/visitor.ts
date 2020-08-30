import * as protobuf from "protobufjs";
import {
  GraphQLFieldConfigMap,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLUnionType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLOutputType,
} from "graphql";
import { Context } from "./context";
import { fullTypeName, convertScalar, isScalar } from "./utils";

export function visit(objects: protobuf.ReflectionObject[]) {
  return visitNested(objects, new Context());
}

function visitNested(
  objects: protobuf.ReflectionObject[],
  context: Context
): GraphQLNamedType[] {
  return objects
    .map((object) => {
      if (object instanceof protobuf.Type) {
        return visitMessage(object, context);
      }
      if (object instanceof protobuf.Enum) {
        return visitEnum(object, context);
      }
      if (object instanceof protobuf.Namespace) {
        return visitNested(object.nestedArray, context);
      }
    })
    .flat()
    .filter(Boolean);
}

function visitMessage(message: protobuf.Type, context: Context) {
  const objectType = new GraphQLObjectType({
    name: fullTypeName(message),
    fields: () => visitFields(message.fieldsArray, context),
  });
  context.setType(objectType);
  return [
    objectType,
    visitOneOfs(message, context),
    visitMaps(message, context),
    visitNested(message.nestedArray, context),
  ];
}

function visitEnum(enm: protobuf.Enum, context: Context) {
  const enumType = new GraphQLEnumType({
    name: fullTypeName(enm),
    values: Object.assign(
      {},
      ...Object.keys(enm.values).map((key) => ({
        [key]: {
          value: enm.values[key].valueOf(),
        },
      }))
    ),
  });
  context.setType(enumType);
  return enumType;
}

function visitOneOfs(message: protobuf.Type, context: Context) {
  return [
    ...new Set(
      message.fieldsArray.map((field) => field.partOf).filter(Boolean)
    ),
  ].map((oneOf) => visitOneOf(oneOf, context));
}

function visitOneOf(oneOf: protobuf.OneOf, context: Context) {
  const unionType = new GraphQLUnionType({
    name: fullTypeName(oneOf),
    types: () =>
      oneOf.fieldsArray.map((field) => visitFieldType(field, context) as GraphQLObjectType),
  });
  context.setType(unionType);
  return unionType;
}

function visitMaps(message: protobuf.Type, context: Context) {
  return message.fieldsArray.map((field) => {
    if (field instanceof protobuf.MapField) {
      field.resolve();
      const objectType = new GraphQLObjectType({
        name: fullTypeName(field),
        fields: () => ({
          key: {
            type: visitDataType(field.keyType, false, null, context),
          },
          value: {
            type: visitDataType(
              field.type,
              field.repeated,
              () => field.resolvedType,
              context
            ),
          },
        }),
      });
      context.setType(objectType);
      return objectType;
    }
    return null;
  });
}

function visitFields<TSource, TContext, TArgs>(
  fields: protobuf.Field[],
  context: Context
): GraphQLFieldConfigMap<TSource, TContext, TArgs> {
  return Object.assign(
    {},
    ...fields.map((field) =>
      field.partOf
        ? {
            [field.partOf.name]: {
              type: visitOneOf(field.partOf, context),
            },
          }
        : {
            [field.name]: {
              type: visitFieldType(field, context),
            },
          }
    )
  );
}

function visitFieldType(field: protobuf.Field, context: Context) {
  if (field instanceof protobuf.MapField) {
    return new GraphQLList(context.getType(fullTypeName(field)));
  }

  const fieldBehaviors = getFieldBehaviors(field);

  return visitDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

function visitDataType(
  type: string,
  repeated: Boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: Set<string>
): GraphQLOutputType {
  const scalar = isScalar(type);
  let dataType = scalar
    ? convertScalar(type)
    : context.getType(fullTypeName(resolver()));

  if (repeated) {
    dataType = new GraphQLList(new GraphQLNonNull(dataType));
  }

  const required =
    fieldBehaviors?.has("REQUIRED") || (scalar && !fieldBehaviors?.has("OPTIONAL"));
  if (required) {
    dataType = new GraphQLNonNull(dataType);
  }

  return dataType;
}

function getFieldBehaviors(field: protobuf.Field) {
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
