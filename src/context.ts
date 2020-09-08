import { GraphQLOutputType, GraphQLNamedType, GraphQLInputType } from "graphql";
import { ConvertOptions } from "./options";
import { getFullTypeName } from "./utils";

export class Context {
  private deferred: Record<string, Deferred<GraphQLNamedType>>;

  public readonly generateInputTypes: boolean;
  public readonly inputTypeNameSuffix: string;
  private transformTypeName: (fullName: string) => string;

  constructor(options?: ConvertOptions) {
    this.generateInputTypes = options?.generateInputTypes ?? false;
    this.inputTypeNameSuffix = options?.inputTypeNameSuffix ?? "Input";
    this.transformTypeName = options?.transformTypeName ?? ((v) => v);
    this.deferred = {};
  }

  private getDeferred(name: string): Deferred<GraphQLNamedType> {
    if (this.deferred[name]) {
      return this.deferred[name];
    }

    const newDeferred = createDeferred<GraphQLNamedType>();
    this.deferred[name] = newDeferred;
    return newDeferred;
  }

  public setType(type: GraphQLNamedType) {
    const deferred = this.getDeferred(type.name);
    deferred.resolve(type);
  }

  public getType(name: string): Promise<GraphQLOutputType> {
    return this.getDeferred(name).promise as Promise<GraphQLOutputType>;
  }

  public setInput(type: GraphQLNamedType) {
    const deferred = this.getDeferred(type.name);
    deferred.resolve(type);
  }

  public getInput(name: string): Promise<GraphQLInputType> {
    return Promise.race([
      this.getDeferred(name).promise,
      this.getDeferred(name + this.inputTypeNameSuffix).promise,
    ]) as Promise<GraphQLInputType>;
  }

  public getFullTypeName(type: protobuf.ReflectionObject): string {
    return this.transformTypeName(getFullTypeName(type));
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason: any): void;
}

function createDeferred<T>(): Deferred<T> {
  const fn: Partial<Pick<Deferred<T>, "resolve" | "reject">> = {};

  const promise = new Promise<T>((resolve, reject) => {
    fn.resolve = resolve;
    fn.reject = reject;
  });

  return {
    promise,
    resolve: fn.resolve as any,
    reject: fn.reject as any,
  };
}
