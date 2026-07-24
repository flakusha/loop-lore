// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Custom ESLint rule: prefer-object-option-parameters
 *
 * Warns when a function has more than 2 parameters and suggests
 * converting to Object-Option Parameter pattern.
 *
 * Pattern: function a(b, c, d) => function a({b, c, d})
 */

const rule: any = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when function has more than 2 parameters, suggest Object-Option Parameter pattern",
      recommended: false,
    },
    messages: {
      tooManyParams:
        "Function has {{count}} parameters. Consider using Object-Option Parameter pattern: fn({a, b, c}) instead of fn(a, b, c).",
    },
    schema: [
      {
        type: "object",
        properties: {
          maxParams: {
            type: "integer",
            minimum: 0,
            default: 2,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: any, options: any[],) {
    const maxParams = options?.[0]?.maxParams ?? 2;

    function checkFunction(node: any,) {
      const params = node.params ?? [];

      // Skip if already using object destructuring pattern (options object)
      for (const param of params) {
        if (param.type === "Identifier" && param.name === "options") {
          return; // Already using object pattern
        }
        if (param.type === "ObjectPattern") {
          return; // Already destructuring
        }
      }

      // Skip class methods (they often have different conventions)
      const parent = node.parent;
      if (parent?.type === "MethodDefinition" && parent.kind !== "constructor") {
        // Skip if method name suggests it's a standard serialization pattern
        const methodName = parent.key?.name;
        if (methodName && ["toJSON", "toObject", "fromJSON", "clone", "equals",].includes(String(methodName,),)) {
          return;
        }
      }

      if (params.length > maxParams) {
        context.report({
          node,
          messageId: "tooManyParams",
          data: {
            count: params.length,
          },
        },);
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

export default rule;
