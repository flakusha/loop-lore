/**
 * The typeof operator is insufficient for precise type checking because:
 *
 * - null bug: typeof null returns 'object' instead of 'null'.
 * - Arrays: typeof [] returns 'object', indistinguishable from plain objects.
 * - Dates/Regex: typeof new Date() and typeof /foo/ both return 'object'.
 *
 * Examples:
 * getType([]);          // "array"
 * getType({});          // "object"
 * getType(null);        // "null"
 * getType(new Date());  // "date"
 * getType(/123/);       // "regexp"
 * getType(function(){});// "function"
 * getType('hello');     // "string"
 * getType(123);         // "number"
 */
export function getType(obj: unknown) {
  const type = typeof obj;

  // Handle primitives and functions directly
  if (type !== "object") return type;

  // Handle null specifically (typeof null === 'object' is a known bug)
  if (obj === null) return "null";

  // Use Object.prototype.toString for complex objects
  return lowerCaseTheFirstLetter(Object.prototype.toString.call(obj).replace(/^\[object (\S+)\]$/, "$1"));
}

const lowerCaseTheFirstLetter = (str: string) => str[0].toLowerCase() + str.slice(1);
