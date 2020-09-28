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
import { Context } from "./context";
import {
  convertScalar,
  isScalar,
  getFieldBehaviors,
  FieldBehaviors,
  wrapType,
  sanitizeFieldName,
} from "./utils";

export function visit(objects: protobuf.ReflectionObject[], context: Context) {
  return visitNested(objects, context);
}

function visitNested(
  objects: protobuf.ReflectionObject[],
  context: Context
): GraphQLNamedType[] {
  const result: GraphQLNamedType[] = [];

  objects
    .map((object) => {
      if (object instanceof protobuf.Type) {
        return visitMessage(object, context);
      }
      if (object instanceof protobuf.Enum) {
        return [createEnum(object, context)];
      }
      if (object instanceof protobuf.Namespace) {
        return visitNested(object.nestedArray, context);
      }
      return null;
    })
    .forEach((val) => {
      if (!val) return;
      result.push(...val);
    });

  return result;
}

function visitMessage(
  message: protobuf.Type,
  context: Context
): GraphQLNamedType[] {
  const result: GraphQLNamedType[] = [];

  const fullName = context.getFullTypeName(message);

  if (!context.skipType(fullName)) {
    const objectType = new GraphQLObjectType({
      name: fullName,
      fields: () => createOutputFields(message.fieldsArray, true, context),
    });
    context.setType(objectType);
    result.push(objectType);
  }

  if (context.generateInputTypes && !context.skipInput(fullName)) {
    const inputType = new GraphQLInputObjectType({
      name: fullName + context.inputTypeNameSuffix,
      fields: () => createInputFields(message.fieldsArray, true, context),
    });
    context.setInput(inputType);
    result.push(inputType);
  }

  result.push(
    ...visitOneOfs(message, context),
    ...visitMaps(message, context),
    ...visitNested(message.nestedArray, context)
  );

  return result;
}

function visitOneOfs(
  message: protobuf.Type,
  context: Context
): GraphQLNamedType[] {
  const result: GraphQLNamedType[] = [];

  new Set(
    message.fieldsArray.map((field) => field.partOf).filter(Boolean)
  ).forEach((oneOf) => {
    result.push(createUnionType(oneOf, context));
    if (context.generateInputTypes) {
      result.push(createInputUnionType(oneOf, context));
    }
  });

  return result;
}

function visitMaps(
  message: protobuf.Type,
  context: Context
): GraphQLNamedType[] {
  const result: GraphQLNamedType[] = [];

  message.fieldsArray.forEach((field) => {
    if (!(field instanceof protobuf.MapField)) return null;

    field.resolve();

    const objectType = new GraphQLObjectType({
      name: context.getFullTypeName(field),
      fields: () => ({
        key: {
          type: createOutputDataType(field.keyType, false, null, context),
        },
        value: {
          type: createOutputDataType(
            field.type,
            field.repeated,
            () => field.resolvedType,
            context
          ),
        },
      }),
    });
    context.setType(objectType);
    result.push(objectType);

    if (context.generateInputTypes) {
      const inputType = new GraphQLInputObjectType({
        name: context.getFullTypeName(field) + context.inputTypeNameSuffix,
        fields: () => ({
          key: {
            type: createInputDataType(field.keyType, false, null, context),
          },
          value: {
            type: createInputDataType(
              field.type,
              field.repeated,
              () => field.resolvedType,
              context
            ),
          },
        }),
      });
      context.setInput(inputType);
      result.push(inputType);
    }
  });

  return result;
}

function createEnum(enm: protobuf.Enum, context: Context): GraphQLEnumType {
  const values: GraphQLEnumValueConfigMap = {};
  Object.keys(enm.values).forEach((key) => {
    values[key] = {
      value: enm.values[key].valueOf(),
    };
  });

  const enumType = new GraphQLEnumType({
    name: context.getFullTypeName(enm),
    values,
  });
  context.setType(enumType);
  context.setInput(enumType);
  return enumType;
}

function createUnionType(
  oneOf: protobuf.OneOf,
  context: Context
): GraphQLUnionType | GraphQLObjectType {
  // FIXME: This doesn't work. Needs deferred evaluation.
  // A union type can only include object types
  // const compatible = oneOf.fieldsArray
  //   .map((field) => createOutputFieldType(field, context, true))
  //   .every((type) => !type || isObjectType(type));
  //
  // if (compatible) {
  //   const unionType = new GraphQLUnionType({
  //     name: context.getFullTypeName(oneOf),
  //     types: () => {
  //       return oneOf.fieldsArray
  //         .map((field) => createOutputFieldType(field, context, true))
  //         .filter(Boolean) as GraphQLObjectType[];
  //     },
  //   });
  //   context.setType(unionType);
  //   return unionType;
  // }

  const objectType = new GraphQLObjectType({
    name: context.getFullTypeName(oneOf),
    fields: () => createOutputFields(oneOf.fieldsArray, false, context),
  });
  context.setType(objectType);
  return objectType;
}

function createInputUnionType(
  oneOf: protobuf.OneOf,
  context: Context
): GraphQLInputObjectType {
  const inputType = new GraphQLInputObjectType({
    name: context.getFullTypeName(oneOf) + context.inputTypeNameSuffix,
    fields: () => createInputFields(oneOf.fieldsArray, false, context),
  });
  context.setInput(inputType);
  return inputType;
}

function createOutputFields<TSource, TContext, TArgs>(
  fields: protobuf.Field[],
  unionTypeEnabled: boolean,
  context: Context
): GraphQLFieldConfigMap<TSource, TContext, TArgs> {
  const map: GraphQLFieldConfigMap<TSource, TContext, TArgs> = {};
  fields.forEach((field) => {
    if (unionTypeEnabled && field.partOf) {
      map[sanitizeFieldName(field.partOf.name)] = {
        type: createUnionType(field.partOf, context),
      };
    } else {
      const type = createOutputFieldType(field, context, !unionTypeEnabled);
      if (type) map[sanitizeFieldName(field.name)] = { type };
    }
  });
  return map;
}

function createInputFields(
  fields: protobuf.Field[],
  unionTypeEnabled: boolean,
  context: Context
): GraphQLInputFieldConfigMap {
  const map: GraphQLInputFieldConfigMap = {};
  fields.forEach((field) => {
    if (unionTypeEnabled && field.partOf) {
      map[sanitizeFieldName(field.partOf.name)] = {
        type: createInputUnionType(field.partOf, context),
      };
    } else {
      const type = createInputFieldType(field, !unionTypeEnabled, context);
      if (type) map[sanitizeFieldName(field.name)] = { type };
    }
  });
  return map;
}

function createOutputFieldType(
  field: protobuf.Field,
  context: Context,
  forceNullable?: boolean
): GraphQLOutputType | null {
  const fieldBehaviors = getFieldBehaviors(field);
  if (fieldBehaviors.has("INPUT_ONLY")) return null;
  if (forceNullable) {
    fieldBehaviors.delete("REQUIRED");
    fieldBehaviors.add("OPTIONAL");
  }

  if (field instanceof protobuf.MapField) {
    return new GraphQLList(context.getType(context.getFullTypeName(field)));
  }

  return createOutputDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

function createInputFieldType(
  field: protobuf.Field,
  forceNullable: boolean,
  context: Context
): GraphQLInputType | null {
  const fieldBehaviors = getFieldBehaviors(field);
  if (fieldBehaviors.has("OUTPUT_ONLY")) return null;

  if (field instanceof protobuf.MapField) {
    return new GraphQLList(context.getType(context.getFullTypeName(field)));
  }

  if (forceNullable) {
    fieldBehaviors.delete("REQUIRED");
    fieldBehaviors.add("OPTIONAL");
  }

  return createInputDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

function createOutputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): GraphQLOutputType {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : context.getType(context.getFullTypeName(resolver()));
  return wrapType(dataType, repeated, fieldBehaviors);
}

function createInputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): GraphQLInputType | null {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : context.getInput(context.getFullTypeName(resolver()));
  return dataType ? wrapType(dataType, repeated, fieldBehaviors) : null;
}
