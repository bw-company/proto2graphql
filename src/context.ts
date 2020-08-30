import { GraphQLOutputType, GraphQLNamedType, GraphQLInputType } from "graphql";

export class Context {
  private types: { [name: string]: GraphQLOutputType };
  private inputs: { [name: string]: GraphQLInputType };

  constructor() {
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
    return this.inputs[name];
  }
}

