import { convert } from "../src";
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
    it(`handles ${test.replace(/_/g, " ")}`, () => {
      const generateInputTypes = /field_behavior|skip/.test(test);

      const testDir = path.join(DIR, test);
      const actual = convert(path.join(testDir, "input.proto"), {
        includeDir,
        generateInputTypes,
      });
      const expected = readFileSync(
        path.join(testDir, "output.graphql"),
        "utf-8"
      );

      if (process.env.SNAPSHOT_UPDATE) {
        writeFileSync(path.join(testDir, "output.graphql"), actual);
      } else {
        expect(actual).toBe(expected);
      }
    });
  });
});

function tests() {
  return readdirSync(DIR)
    .filter((p) => lstatSync(path.join(DIR, p)).isDirectory())
    .filter((dir) => existsSync(path.join(DIR, dir, "input.proto")));
}
