// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parameter node types counted as "positional". `ObjectPattern` (an options
 * object) and `RestElement` (`...rest`) are deliberately excluded from the
 * count -- a rest element is not itself a positional param -- but a function
 * that has 3+ other positional params is still flagged.
 *
 * `TSParameterProperty` is also excluded: parameter properties cannot be
 * destructured, so the options-object rewrite cannot express them.
 *
 * `AssignmentPattern` is absent because the binding is unwrapped first --
 * `{ c, d } = {}` is an options object with a default, not a positional param,
 * whereas `opts = {}` unwraps to an `Identifier` and still counts as one.
 *
 * @type {Record<string, true>}
 */
const POSITIONAL_PARAM_TYPES = {
  Identifier: true,
  ArrayPattern: true,
};

/**
 * ESLint rule: functions with 3+ positional params should take a single
 * destructured options object. See `.agents/references/recommendations.md`
 * (Options-object parameters).
 *
 * Class members need no special handling: `MethodDefinition.value` /
 * `PropertyDefinition.value` are traversed as ordinary function nodes, so a
 * dedicated member visitor would double-report them.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
export const optionsObjectParamsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Functions with 3+ positional params should take a single destructured options object",
    },
    schema: [],
    messages: {
      optionsObject:
        "Use a single destructured options object for 3+ params instead of positional args -- see .agents/references/recommendations.md (Options-object parameters).",
    },
  },
  create(context,) {
    /**
     * True when a type annotation already pins this function's arity, so the
     * options-object rewrite would break assignability instead of fixing it.
     *
     * Deliberately narrow -- TWO declaration shapes, matched directly on the
     * annotated node. A looser "some ancestor is annotated" test would also
     * match every method inside a typed class (102 findings), most of which are
     * genuinely refactorable; class members are excluded structurally, because
     * their parent is `MethodDefinition`/`PropertyDefinition`, never `Property`.
     *
     * Known cost, accepted: this permanently hides someone appending a 4th
     * parameter to a typed callback slot. That edit lands on the interface or
     * the type alias, where a reviewer is already looking, and tsc rejects any
     * implementor that did not follow -- the leak is mitigated, not closed.
     *
     * @param {import("eslint").Rule.Node} node
     * @returns {boolean}
     */
    function isTypedConstSlot(node,) {
      // `const f: T = (a, b, c) => {}`
      const d = node.parent;
      return d?.type === "VariableDeclarator" && d.init === node &&
        d.id.type === "Identifier" && d.id.typeAnnotation != null;
    }
    /**
     * A method of an object literal whose shape is dictated by an annotation:
     * either the literal IS the direct `return { ... }` of an annotated function
     * (`function f(): T`), or it is bound by an annotated const
     * (`const self: T = { ... }`) inside one -- the latter is how the factory
     * services here express the same idea. A local built now and returned later
     * is NOT exempt: nothing pins its members.
     *
     * @param {import("eslint").Rule.Node} node
     * @returns {boolean}
     */
    function isTypedObjectLiteralSlot(node,) {
      const prop = node.parent;
      if (prop?.type !== "Property" || prop.value !== node) { return false; }
      const literal = prop.parent;
      if (literal?.type !== "ObjectExpression") { return false; }
      const slot = literal.parent;
      if (slot?.type === "VariableDeclarator" && slot.init === literal) {
        return slot.id.type === "Identifier" && slot.id.typeAnnotation != null;
      }
      if (slot?.type !== "ReturnStatement" || slot.argument !== literal) { return false; }
      const block = slot.parent;
      const fn = block?.parent;
      return block?.type === "BlockStatement" && "returnType" in (fn ?? {}) && fn.returnType != null;
    }
    /**
     * @param {import("eslint").Rule.Node} node
     */
    function checkFunction(node,) {
      if (isTypedConstSlot(node,) || isTypedObjectLiteralSlot(node,)) { return; }
      const fn =
        /** @type {{ body: unknown; params: { type: string; name?: string; left?: { type: string } }[] }} */ (node);
      // Skip signatures without a body (overloads, `declare`, abstract
      // members): there is no implementation to refactor.
      if (!fn.body) { return; }
      // A TypeScript `this` parameter is an Identifier named "this" and is not
      // a real argument; exclude it so it cannot inflate the positional count.
      const params = fn.params[0]?.type === "Identifier" && fn.params[0]?.name === "this"
        ? fn.params.slice(1,)
        : fn.params;
      // Unwrap defaults before counting: `b = 1` is one positional param, but
      // `{ c, d } = {}` is an options object and must not inflate the count.
      const positional = params.filter((param,) => {
        const binding = param.type === "AssignmentPattern" ? param.left : param;
        return POSITIONAL_PARAM_TYPES[binding.type] === true;
      },);
      if (positional.length < 3) { return; }
      context.report({ node, messageId: "optionsObject", },);
    }
    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

export default optionsObjectParamsRule;
