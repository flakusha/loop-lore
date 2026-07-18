/**
 * Script-mode ambient module declarations for vendor packages without types.
 *
 * MUST be script-mode (no export/import) because declare module ambient
 * shims don't propagate from module-mode .d.ts files.
 * Auto-included by tsconfig via src/frontend glob.
 */

declare module "alpinejs" {
  const Alpine: any;
  export default Alpine;
}

declare module "@alpinejs/morph" {
  const morph: any;
  export default morph;
}
