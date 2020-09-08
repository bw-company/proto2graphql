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
  isObjectType,
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
  return Promise.all(visitNested(objects, context));
}

function visitNested(
  objects: protobuf.ReflectionObject[],
  context: Context
): Promise<GraphQLNamedType>[] {
  const result: Promise<GraphQLNamedType>[] = [];

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
): Promise<GraphQLNamedType>[] {
  const result: Promise<GraphQLNamedType>[] = [];

  result.push(new Promise<GraphQLObjectType>(async (resolve) => {
    const objectType = new GraphQLObjectType({
      name: context.getFullTypeName(message),
      fields: await createOutputFields(message.fieldsArray, true, context),
    });
    context.setType(objectType);
    resolve(objectType);
  }));

  if (context.generateInputTypes) {
    result.push(new Promise<GraphQLInputObjectType>(async (resolve) => {
      const inputType = new GraphQLInputObjectType({
        name: context.getFullTypeName(message) + context.inputTypeNameSuffix,
        fields: await createInputFields(message.fieldsArray, true, context),
      });
      context.setInput(inputType);
      resolve(inputType);
    }));
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
): Promise<GraphQLNamedType>[] {
  const result: Promise<GraphQLNamedType>[] = [];

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
): Promise<GraphQLNamedType>[] {
  const result: Promise<GraphQLNamedType>[] = [];

  message.fieldsArray.forEach((field) => {
    if (!(field instanceof protobuf.MapField)) return null;

    field.resolve();

    result.push(new Promise<GraphQLObjectType>(async (resolve) => {
      const [keyType, valueType] = await Promise.all([
        createOutputDataType(field.keyType, false, null, context),
        createOutputDataType(
          field.type,
          field.repeated,
          () => field.resolvedType,
          context
        ),
      ]);
      const objectType = new GraphQLObjectType({
        name: context.getFullTypeName(field),
        fields: {
          key: {
            type: keyType,
          },
          value: {
            type: valueType,
          },
        },
      });
      context.setType(objectType);
      resolve(objectType);
    }));

    if (context.generateInputTypes) {
      result.push(new Promise<GraphQLInputObjectType>(async (resolve) => {
        const [keyType, valueType] = await Promise.all([
          createInputDataType(field.keyType, false, null, context),
          createInputDataType(
            field.type,
            field.repeated,
            () => field.resolvedType,
            context
          ),
        ]);
        const inputType = new GraphQLInputObjectType({
          name: context.getFullTypeName(field) + context.inputTypeNameSuffix,
          fields: {
            key: {
              type: keyType,
            },
            value: {
              type: valueType,
            },
          },
        });
        context.setInput(inputType);
        resolve(inputType);
      }));
    }
  });

  return result;
}

function createEnum(enm: protobuf.Enum, context: Context): Promise<GraphQLEnumType> {
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

  return Promise.resolve(enumType);
}

async function createUnionType(
  oneOf: protobuf.OneOf,
  context: Context
): Promise<GraphQLUnionType | GraphQLObjectType> {
  // A union type can only include object types
  const types = await Promise.all(
    oneOf.fieldsArray
    .map((field) => createOutputFieldType(field, context, true))
  );
  const compatibleTypes = types.filter((type) => !type || isObjectType(type));

  if (compatibleTypes.length === types.length) {
    const unionType = new GraphQLUnionType({
      name: context.getFullTypeName(oneOf),
      types: () => compatibleTypes.filter(Boolean) as GraphQLObjectType[],
    });
    context.setType(unionType);
    return unionType;
  } else {
    const objectType = new GraphQLObjectType({
      name: context.getFullTypeName(oneOf),
      fields: await createOutputFields(oneOf.fieldsArray, false, context),
    });
    context.setType(objectType);
    return objectType;
  }
}

async function createInputUnionType(
  oneOf: protobuf.OneOf,
  context: Context
): Promise<GraphQLInputObjectType> {
  const inputType = new GraphQLInputObjectType({
    name: context.getFullTypeName(oneOf) + context.inputTypeNameSuffix,
    fields: await createInputFields(oneOf.fieldsArray, false, context),
  });
  context.setInput(inputType);
  return inputType;
}

async function createOutputFields<TSource, TContext, TArgs>(
  fields: protobuf.Field[],
  unionTypeEnabled: boolean,
  context: Context
): Promise<GraphQLFieldConfigMap<TSource, TContext, TArgs>> {
  const map: GraphQLFieldConfigMap<TSource, TContext, TArgs> = {};

  const fieldDefs = await Promise.all(fields.map(async (field) => {
    if (unionTypeEnabled && field.partOf) {
      return {
        name: sanitizeFieldName(field.partOf.name),
        type: await createUnionType(field.partOf, context),
      };
    } else {
      const type = await createOutputFieldType(field, context, !unionTypeEnabled);
      if (!type) return null;
      return {
        name: sanitizeFieldName(field.name),
        type,
      };
    }
  }));

  fieldDefs.forEach((def) => {
    if (!def) return;
    map[def.name] = { type: def.type };
  });

  return map;
}

async function createInputFields(
  fields: protobuf.Field[],
  unionTypeEnabled: boolean,
  context: Context
): Promise<GraphQLInputFieldConfigMap> {
  const map: GraphQLInputFieldConfigMap = {};

  const fieldDefs = await Promise.all(fields.map(async (field) => {
    if (unionTypeEnabled && field.partOf) {
      return {
        name: sanitizeFieldName(field.partOf.name),
        type: await createInputUnionType(field.partOf, context),
      };
    } else {
      const type = await createInputFieldType(field, !unionTypeEnabled, context);
      if (!type) return null;
      return {
        name: sanitizeFieldName(field.name),
        type,
      };
    }
  }));

  fieldDefs.forEach((def) => {
    if (!def) return;
    map[def.name] = { type: def.type };
  });

  return map;
}

async function createOutputFieldType(
  field: protobuf.Field,
  context: Context,
  forceNullable?: boolean
): Promise<GraphQLOutputType | null> {
  const fieldBehaviors = getFieldBehaviors(field);
  if (fieldBehaviors.has("INPUT_ONLY")) return null;
  if (forceNullable) {
    fieldBehaviors.delete("REQUIRED");
    fieldBehaviors.add("OPTIONAL");
  }

  if (field instanceof protobuf.MapField) {
    field.resolve();
    return new GraphQLList(await context.getType(context.getFullTypeName(field)));
  }

  return createOutputDataType(
    field.type,
    field.repeated,
    () => field.resolve().resolvedType,
    context,
    fieldBehaviors
  );
}

async function createInputFieldType(
  field: protobuf.Field,
  forceNullable: boolean,
  context: Context
): Promise<GraphQLInputType | null> {
  const fieldBehaviors = getFieldBehaviors(field);
  if (fieldBehaviors.has("OUTPUT_ONLY")) return null;

  if (field instanceof protobuf.MapField) {
    return new GraphQLList(await context.getType(context.getFullTypeName(field)));
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

async function createOutputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): Promise<GraphQLOutputType> {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : await context.getType(context.getFullTypeName(resolver()));
  return wrapType(dataType, repeated, fieldBehaviors);
}

async function createInputDataType(
  type: string,
  repeated: boolean,
  resolver: () => protobuf.ReflectionObject | null,
  context: Context,
  fieldBehaviors?: FieldBehaviors
): Promise<GraphQLInputType | null> {
  const dataType = isScalar(type)
    ? convertScalar(type)
    : await context.getInput(context.getFullTypeName(resolver()));
  return dataType ? wrapType(dataType, repeated, fieldBehaviors) : null;
}
