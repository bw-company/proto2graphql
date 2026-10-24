export interface ConvertOptions {
  includeDir?: string;
  includeDirs?: string[];
  generateInputTypes?: boolean;
  inputTypeNameSuffix?: string;
  emptyTypeField?: string;
  transformTypeName?(fullName: string): string;
  skipType?(fullName: string): boolean;
  skipInput?(fullName: string): boolean;
  skipFile?(filename: string): boolean;
}
