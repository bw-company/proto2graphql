export interface ConvertOptions {
  includeDir?: string;
  includeDirs?: string[];
  generateInputTypes?: boolean;
  inputTypeNameSuffix?: string;
  transformTypeName?(fullName: string): string;
  skipType?(fullName: string): boolean;
  skipInput?(fullName: string): boolean;
}
