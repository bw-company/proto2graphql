import { convert, ConvertOptions } from "../src";
import { describe, expect, it } from "vitest";
import {
  lstatSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";
import * as path from "path";

const DIR = __dirname;
const includeDir = path.join(DIR, "..", "tmp/protos-include");

describe("converter", () => {
  tests().forEach((test) => {
    it(`handles ${test.replace(/_/g, " ")}`, async () => {
      const generateInputTypes = /field_behavior|skip/.test(test);

      const testDir = path.join(DIR, test);
      const actual = convert(path.join(testDir, "input.proto"), {
        includeDir,
        generateInputTypes,
        ...(await loadOptions(testDir)),
      });
      const snapshot = path.join(testDir, "output.graphql");
      if (process.env.SNAPSHOT_UPDATE) {
        writeFileSync(snapshot, actual);
      } else {
        expect(actual).toBe(readFileSync(snapshot, "utf-8"));
      }
    });
  });
});

function tests() {
  return readdirSync(DIR)
    .filter((p) => lstatSync(path.join(DIR, p)).isDirectory())
    .filter((dir) => existsSync(path.join(DIR, dir, "input.proto")));
}

// A test directory may ship an options.ts whose default export is merged over the defaults above
async function loadOptions(testDir: string): Promise<ConvertOptions> {
  const file = path.join(testDir, "options.ts");
  if (!existsSync(file)) return {};
  return (await import(file)).default;
}
