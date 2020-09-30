import { GraphQLOutputType, GraphQLNamedType, GraphQLInputType } from "graphql";
import { ConvertOptions } from "./options";
import { getFullTypeName } from "./utils";

const GEN_OPTION_PROTO_PATTERN = /^proto2graphql_/;

export class Context {
  private types: { [name: string]: GraphQLOutputType };
  private inputs: { [name: string]: GraphQLInputType };

  public readonly generateInputTypes: boolean;
  public readonly inputTypeNameSuffix: string;
  private transformTypeName: (fullName: string) => string;
  private _skipType?: (fullName: string) => boolean;
  private _skipInput?: (fullName: string) => boolean;

  constructor(options?: ConvertOptions) {
    this.generateInputTypes = options?.generateInputTypes ?? false;
    this.inputTypeNameSuffix = options?.inputTypeNameSuffix ?? "Input";
    this.transformTypeName = options?.transformTypeName ?? ((v) => v);
    this._skipType = options?.skipType;
    this._skipInput = options?.skipInput;
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

  public skipType(fullName: string): boolean {
    if (this._skipType?.(fullName)) return true;
    if (fullName.match(GEN_OPTION_PROTO_PATTERN)) return true;
    return false;
  }

  public skipInput(fullName: string): boolean {
    if (this._skipInput?.(fullName)) return true;
    if (fullName.match(GEN_OPTION_PROTO_PATTERN)) return true;
    return false;
  }
}
