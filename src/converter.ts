import { existsSync } from "fs";
import { printType } from "graphql";
import * as path from "path";
import { Root } from "protobufjs";
import { visit } from "./visitor";
import { Context } from "./context";
import { ConvertOptions } from "./options";

const GEN_OPTION_PROTO_DIR = path.join(__dirname, "..", "proto");

export function convert(filename: string, options?: ConvertOptions) {
  const includeDirs: string[] = [];
  if (options?.includeDir) includeDirs.push(options.includeDir);
  includeDirs.push(GEN_OPTION_PROTO_DIR);

  const root = new Root();
  root.resolvePath = resolverFactory(root.resolvePath, includeDirs);
  root.loadSync(filename);

  const context = new Context(options);
  const types = visit(root.nestedArray, context);
  return types.map((type) => printType(type)).join("\n\n") + "\n";
}

type Resolver = (origin: string, target: string) => string;
function resolverFactory(
  defaultResolver: Resolver,
  includeDirs: string[]
): Resolver {
  const resolvedPaths: Record<string, string> = {};

  return (origin, target) => {
    const cacheKey = `${origin}:${target}`;
    if (!resolvedPaths[cacheKey]) {
      resolvedPaths[cacheKey] = (() => {
        for (const dir of includeDirs) {
          const includePath = path.join(dir, target);
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
