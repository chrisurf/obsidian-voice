/** YAML files bundled as text (esbuild "text" loader; a Jest transform). */
declare module "*.yaml" {
  const text: string;
  export default text;
}
