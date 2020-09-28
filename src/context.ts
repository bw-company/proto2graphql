import { GraphQLOutputType, GraphQLNamedType, GraphQLInputType } from "graphql";
import { ConvertOptions } from "./options";
import { getFullTypeName } from "./utils";

export class Context {
  private types: { [name: string]: GraphQLOutputType };
  private inputs: { [name: string]: GraphQLInputType };

  public readonly generateInputTypes: boolean;
  public readonly inputTypeNameSuffix: string;
  private transformTypeName: (fullName: string) => string;
  public skipType: (fullName: string) => boolean;
  public skipInput: (fullName: string) => boolean;

  constructor(options?: ConvertOptions) {
    this.generateInputTypes = options?.generateInputTypes ?? false;
    this.inputTypeNameSuffix = options?.inputTypeNameSuffix ?? "Input";
    this.transformTypeName = options?.transformTypeName ?? ((v) => v);
    this.skipType = options?.skipType ?? (() => false);
    this.skipInput = options?.skipInput ?? (() => false);
    this.types = {};
    this.inputs = {};
  }

  public setType(type: GraphQLNamedType) {
    this.types[type.name] = type as GraphQLOutputType;
  }

  public getType(name: string) {
    return this.types[name];
  }

  public setInput(type: GraphQLNamedType) {
    this.inputs[type.name] = type as GraphQLInputType;
  }

  public getInput(name: string) {
    return this.inputs[name] ?? this.inputs[name + this.inputTypeNameSuffix];
  }

  public getFullTypeName(type: protobuf.ReflectionObject): { original: string; name: string } {
    const fullName = getFullTypeName(type);
    return {
      name: this.transformTypeName(fullName),
      original: fullName,
    };
  }
}
