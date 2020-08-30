import * as protobuf from "protobufjs";
import {
  GraphQLFieldConfigMap,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLUnionType,
  GraphQLList,
  GraphQLOutputType,
  GraphQLInputObjectType,
  GraphQLInputFieldConfigMap,
  GraphQLInputType,
  GraphQLEnumValueConfigMap,
} from "graphql";
import { Context, inputTypeNameSuffix } from "./context";
import { fullTypeName, convertScalar, isScalar, getFieldBehaviors, FieldBehaviors, wrapType } from "./utils";

export function visit(objects: protobuf.ReflectionObject[], generateInputTypes: boolean) {
  return visitNested(objects, new Context(generateInputTypes));
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

function visitMessage(message: protobuf.Type, context: Context): GraphQLNamedType[] {
  const result: GraphQLNamedType[] = [];

  const objectType = new GraphQLObjectType({
    name: fullTypeName(message),
    fields: () => visitOutputFields(message.fieldsArray, context),
  });
  context.setType(objectType);
  result.push(
    objectType,
    ...visitOneOfs(message, context),
    ...visitMaps(message, context),
    ...visitNested(message.nestedArray, context),
  );

  if (context.generateInputTypes) {
    const inputType = new GraphQLInputObjectType({
      name: fullTypeName(message) + inputTypeNameSuffix,
      fields: () => visitInputFields(message.fieldsArray, context),
    });
    context.setInput(inputType);
    result.push(inputType);
  }

  return result;
}

function visitEnum(enm: protobuf.Enum, context: Context): GraphQLEnumType {
  const values: GraphQLEnumValueConfigMap = {};
  Object.keys(enm.values).forEach((key) => {
    values[key] = {
      value: enm.values[key].valueOf(),
    };
  });

  const enumType = new GraphQLEnumType({
    name: fullTypeName(enm),
    values,
  });
  context.setType(enumType);
  context.setInput(enumType);
  return enumType;
}

function visitOneOfs(message: protobuf.Type, context: Context): GraphQLUnionType[] {
  return [
    ...new Set(
      message.fieldsArray.map((field) => field.partOf).filter(Boolean)
    ),
  ].map((oneOf) => visitOneOf(oneOf, context));
}

function visitOneOf(oneOf: protobuf.OneOf, context: Context): GraphQLUnionType {
  const unionType = new GraphQLUnionType({
    name: fullTypeName(oneOf),
    types: () =>
      oneOf.fieldsArray.map((field) => visitOutputFieldType(field, context) as GraphQLObjectType),
  });
  context.setType(unionType);
  return unionType;
}

function visitMaps(message: protobuf.Type, context: Context) {
  return message.fieldsArray.map((field) => {
    if (!(field instanceof protobuf.MapField)) return null;

    field.resolve();
    const objectType = new GraphQLObjectType({
      name: fullTypeName(field),
      fields: () => ({
        key: {
          type: visitOutputDataType(field.keyType, false, null, context),
        },
        value: {
          type: visitOutputDataType(
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
  });
}

function visitOutputFields<TSource, TContext, TArgs>(
  fields: protobuf.Field[],
  context: Context
): GraphQLFieldConfigMap<TSource, TContext, TArgs> {
  const map: GraphQLFieldConfigMap<TSource, TContext, TArgs> = {};
  fields.forEach((field) => {
    if (field.partOf) {
      map[field.partOf.name] = {
        type: visitOneOf(field.partOf, context),
      };
    } else {
      map[field.name] = {
        type: visitOutputFieldType(field, context),
      };
    }
  });
  return map;
}

function visitInputFields(
  fields: protobuf.Field[],
  context: Context
): GraphQLInputFieldConfigMap {
  const map: GraphQLInputFieldConfigMap = {};
  fields.forEach((field) => {
    if (field.partOf) {
      // FIXME: https://github.com/graphql/graphql-spec/issues/488
      // map[field.partOf.name] = {
      //   type: visitOneOf(field.partOf, context),
      // };
    } else {
      const type = visitInputFieldType(field, context);
      if (type) map[field.name] = { type };
    }
  });
  return map;
}

function visitOutputFieldType(field: protobuf.Field, context: Context): GraphQLOutputType {
  if (field instanceof protobuf.MapField) {
    return new GraphQLList(context.getType(fullTypeName(field)));
  }

  const fieldBehaviors = getFieldBehaviors(field);

  return visitOutputDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

function visitInputFieldType(field: protobuf.Field, context: Context): GraphQLInputType | null {
  const fieldBehaviors = getFieldBehaviors(field);
  if (fieldBehaviors.has("OUTPUT_ONLY")) return null;

  if (field instanceof protobuf.MapField) {
    return new GraphQLList(context.getType(fullTypeName(field)));
  }

  return visitInputDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

function visitOutputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): GraphQLOutputType {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : context.getType(fullTypeName(resolver()));
  return wrapType(dataType, repeated, fieldBehaviors);
}

function visitInputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): GraphQLInputType | null {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : context.getInput(fullTypeName(resolver()));
  return dataType ? wrapType(dataType, repeated, fieldBehaviors) : null;
}
