import * as path from "path";
import { ConvertOptions } from "../../src";

const options: ConvertOptions = {
  includeDirs: [
    path.join(__dirname, "includes1"),
    path.join(__dirname, "includes2"),
  ],
};

export default options;
