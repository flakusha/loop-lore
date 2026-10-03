// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parameter node types counted as "positional". `ObjectPattern` (an options
 * object) and `RestElement` (`...rest`) are deliberately excluded: a function
 * that already takes a destructured object, or whose last param is a rest
 * tuple, is not a candidate for the options-object rewrite.
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
     * @param {import("eslint").Rule.Node} node
     */
    function checkFunction(node,) {
      const fn = /** @type {{ body: unknown; params: { type: string; name?: string; left?: { type: string } }[] }} */ (node);
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
