import { existsSync } from "fs";
import { printType } from "graphql";
import * as path from "path";
import { Root } from "protobufjs";
import { visit } from "./visitor";
import { Context } from "./context";
import { ConvertOptions } from "./options";

const GEN_OPTION_PROTO_DIR = path.join(__dirname, "..", "proto");

export function convert(files: string | string[], options?: ConvertOptions) {
  const includeDirs: string[] = [...(options?.includeDirs ?? [])];
  if (options?.includeDir) includeDirs.push(options.includeDir);
  includeDirs.push(GEN_OPTION_PROTO_DIR);

  const root = new Root();
  root.resolvePath = resolverFactory(root.resolvePath, includeDirs);
  loadWithoutStackTraces(root, files);

  const context = new Context(options);
  const types = visit(root.nestedArray, context);
  return types.map((type) => printType(type)).join("\n\n") + "\n";
}

// protobufjs reads every option value by first trying to parse it as a number and throwing when
// that fails, so parsing a file with many field options builds thousands of Error objects. Capturing
// their stack traces dominates parse time, and the messages already carry file and line.
function loadWithoutStackTraces(root: Root, files: string | string[]) {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    root.loadSync(files);
  } catch (e) {
    Error.stackTraceLimit = limit;
    throw e instanceof Error ? new Error(e.message, { cause: e }) : e;
  } finally {
    Error.stackTraceLimit = limit;
  }
}

type Resolver = (origin: string, target: string) => string;
function resolverFactory(
  defaultResolver: Resolver,
  includeDirs: string[]
): Resolver {
  // Hits in the include directories do not depend on the importing file, only the fallback does
  const byTarget = new Map<string, string | null>();
  const byOrigin = new Map<string, string>();

  return (origin, target) => {
    let found = byTarget.get(target);
    if (found === undefined) {
      found = null;
      for (const dir of includeDirs) {
        const includePath = path.join(dir, target);
        if (existsSync(includePath)) {
          found = includePath;
          break;
        }
      }
      byTarget.set(target, found);
    }
    if (found !== null) return found;

    const cacheKey = `${origin}:${target}`;
    let resolved = byOrigin.get(cacheKey);
    if (resolved === undefined) {
      resolved = defaultResolver(origin, target);
      byOrigin.set(cacheKey, resolved);
    }
    return resolved;
  };
}
