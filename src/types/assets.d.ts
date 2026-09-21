// Bun's bundler turns a CSS side-effect import into a stylesheet link.
// TypeScript needs to be told the module exists.
declare module "*.css";
