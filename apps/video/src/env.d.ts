declare module "*.css";
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}

declare namespace NodeJS {
  interface Require {
    context?: (directory: string, recursive: boolean, regExp: RegExp) => { keys: () => string[]; (id: string): unknown };
  }
}
