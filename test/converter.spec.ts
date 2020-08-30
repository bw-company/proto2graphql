import { convert } from "..";
import { expect } from "chai";
import {
  lstatSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "fs";
import * as path from "path";
import "mocha";

const DIR = __dirname;
const includeDir = path.join(DIR, "..", "protos");
console.log(includeDir);

describe("converter", () => {
  tests().forEach((test) => {
    it(`handles ${test.replace(/_/g, " ")}`, () => {
      const testDir = path.join(DIR, test);
      const actual = convert(path.join(testDir, "input.proto"), includeDir);
      const expected = readFileSync(
        path.join(testDir, "output.graphql"),
        "UTF-8"
      );

      if (process.env.SNAPSHOT_UPDATE) {
        writeFileSync(path.join(testDir, "output.graphql"), actual);
      } else {
        expect(actual).equal(expected);
      }
    });
  });
});

function tests() {
  return readdirSync(DIR)
    .filter((p) => lstatSync(path.join(DIR, p)).isDirectory())
    .filter((dir) => existsSync(path.join(DIR, dir, "input.proto")));
}
