/**
 * @deprecated Use `new Plugin({...})` instead. `definePlugin` is a thin
 * wrapper kept for backward compatibility.
 *
 * ```ts
 * // Before:
 * definePlugin("my-plugin", { ... })
 *
 * // After:
 * new Plugin({ id: "my-plugin", ... })
 * ```
 */
export { Plugin as definePlugin } from "./plugin";
