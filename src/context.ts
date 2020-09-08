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

    setTimeout(() => {
      console.log("Context.deferred {");
      Object.entries(this.deferred).forEach(([key, value]) => {
        console.log("  ", key, ":", value.state);
      });
      console.log("}");
    }, 1000);
  }

  private getDeferred(name: string): Deferred<GraphQLNamedType> {
    if (this.deferred[name]) {
      console.log("---- get(cache):", name);
      return this.deferred[name];
    }

    console.log("---- get(new):", name);
    const newDeferred = createDeferred<GraphQLNamedType>();
    this.deferred[name] = newDeferred;
    return newDeferred;
  }

  public setType(type: GraphQLNamedType) {
    const deferred = this.getDeferred(type.name);
    console.log("---- resolve:", type.name);
    deferred.resolve(type);
  }

  public getType(name: string): Promise<GraphQLOutputType> {
    return this.getDeferred(name).promise as Promise<GraphQLOutputType>;
  }

  public setInput(type: GraphQLNamedType) {
    const deferred = this.getDeferred(type.name);
    console.log("---- resolve:", type.name);
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
  state: "pending" | "resolved" | "rejected";
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason: any): void;
}

function createDeferred<T>(): Deferred<T> {
  const fn: Partial<Pick<Deferred<T>, "resolve" | "reject">> = {};

  const promise = new Promise<T>((resolve, reject) => {
    fn.resolve = resolve;
    fn.reject = reject;
  });

  let state: "pending" | "resolved" | "rejected" = "pending";
  return {
    promise,
    get state() {
      return state;
    },
    resolve(value) {
      if (state !== "pending") return;
      state = "resolved";
      fn.resolve?.(value);
    },
    reject(reason) {
      if (state !== "pending") return;
      state = "rejected";
      fn.reject?.(reason);
    }
  };
}
