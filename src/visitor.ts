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
  GraphQLInputObjectType,
  GraphQLInputFieldConfigMap,
  GraphQLInputType,
  isScalarType,
  isEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLType,
} from "graphql";
import { Context } from "./context";
import { fullTypeName, convertScalar, isScalar } from "./utils";

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

function visitMessage(message: protobuf.Type, context: Context) {
  const result: GraphQLNamedType[] = [];

  const objectType = new GraphQLObjectType({
    name: fullTypeName(message),
    fields: () => visitFields(message.fieldsArray, context),
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
      name: fullTypeName(message) + "FullInput",
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
      oneOf.fieldsArray.map((field) => visitFieldType(field, context) as GraphQLObjectType),
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

function visitFields<TSource, TContext, TArgs>(
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
        type: visitFieldType(field, context),
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

function visitFieldType(field: protobuf.Field, context: Context): GraphQLOutputType {
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
  repeated: Boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: Set<string>
): GraphQLOutputType {
  let dataType = isScalar(type)
    ? convertScalar(type)
    : context.getType(fullTypeName(resolver()));

  if (repeated) {
    dataType = new GraphQLList(new GraphQLNonNull(dataType));
  }

  const required =
    fieldBehaviors?.has("REQUIRED") || ((isScalarType(dataType) || isEnumType(dataType)) && !fieldBehaviors?.has("OPTIONAL"));
  if (required) {
    dataType = new GraphQLNonNull(dataType);
  }

  return dataType;
}

function visitInputDataType(
  type: string,
  repeated: Boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: Set<string>
): GraphQLInputType | null {
  let dataType: GraphQLInputType | null = null;

  if (isScalar(type)) {
    dataType = convertScalar(type);
  } else {
    const name = fullTypeName(resolver());
    dataType = context.getInput(name + "FullInput") ?? context.getInput(name);
  }

  if (!dataType) return null;

  if (repeated) {
    dataType = new GraphQLList(new GraphQLNonNull(dataType));
  }

  const required =
    fieldBehaviors?.has("REQUIRED") || ((isScalarType(dataType) || isEnumType(dataType)) && !fieldBehaviors?.has("OPTIONAL"));
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
