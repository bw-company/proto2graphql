import { existsSync } from "fs";
import { printType } from "graphql";
import * as path from "path";
import { Root } from "protobufjs";
import { visit } from "./visitor";
import { Context } from "./context";
import { ConvertOptions } from "./options";

export function convert(filename: string, options?: ConvertOptions) {
  const root = new Root();
  root.resolvePath = resolverFactory(root.resolvePath, options?.includeDir);
  root.loadSync(filename);

  const context = new Context(options);
  const types = visit(root.nestedArray, context);
  return types.map((type) => printType(type)).join("\n");
}

type Resolver = (origin: string, target: string) => string;
function resolverFactory(
  defaultResolver: Resolver,
  includeDir?: string
): Resolver {
  const resolvedPaths: Record<string, string> = {};

  return (origin, target) => {
    const cacheKey = `${origin}:${target}`;
    if (!resolvedPaths[cacheKey]) {
      resolvedPaths[cacheKey] = (() => {
        if (includeDir) {
          const includePath = path.join(includeDir, target);
          if (existsSync(includePath)) {
            return includePath;
          }
        }
        return defaultResolver(origin, target);
      })();
    }
    return resolvedPaths[cacheKey];
  };
}
