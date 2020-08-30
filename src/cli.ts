import * as program from "commander";
import { convert } from "./converter";
import { writeFileSync } from "fs";

program
  .version(require("../package.json").version)
  .option("-i, --input [path]", 'path to ".proto" file')
  .option(
    "-o, --output [path]",
    'path to ".graphql" output, otherwise uses STDOUT'
  )
  .option("--include [path]", "path to include directory")
  .parse(process.argv);

const schema = convert(program.input, {
  includeDir: program.include,
});

if (program.output) {
  writeFileSync(program.output, schema);
} else {
  console.log(schema);
}
