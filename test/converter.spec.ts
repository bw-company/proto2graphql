import { convert } from "..";
import { expect } from "chai";
import { lstatSync, readdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import "mocha";

const DIR = __dirname;

describe("converter", () => {
  tests().forEach(test => {
    it(`handles ${test.replace(/_/g, " ")}`, () => {
      const testDir = join(DIR, test);
      const actual = convert(join(testDir, "input.proto"));
      const expected = readFileSync(join(testDir, "output.graphql"), "UTF-8");

      if (process.env.SNAPSHOT_UPDATE) {
        writeFileSync(join(testDir, "output.graphql"), actual);
      } else {
        expect(actual).equal(expected);
      }
    });
  });
});

function tests() {
  return readdirSync(DIR)
    .filter(dirent => lstatSync(join(DIR, dirent)).isDirectory())
    .filter(subdir => existsSync(join(DIR, subdir, "input.proto")));
}
