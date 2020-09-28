export interface ConvertOptions {
  includeDir?: string;
  generateInputTypes?: boolean;
  inputTypeNameSuffix?: string;
  transformTypeName?(fullName: string): string;
  skipType?(fullName: string): boolean;
  skipInput?(fullName: string): boolean;
}
