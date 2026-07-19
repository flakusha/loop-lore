import { resolve, } from "node:path";
console.log("CWD:", process.cwd(),);
console.log("Resolved path:", resolve(__dirname, "../../src/db/index",),);
