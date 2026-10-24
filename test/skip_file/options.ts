import { ConvertOptions } from "../../src";

const options: ConvertOptions = {
  skipFile: (filename) => filename.endsWith("google/protobuf/descriptor.proto"),
};

export default options;
