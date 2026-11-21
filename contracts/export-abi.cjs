// Copies the compiled ABI + bytecode into the Next.js app (src/lib/abi/SaksiRegistry.json).
const fs = require("node:fs");
const path = require("node:path");
const art = require("./artifacts/src/SaksiRegistry.sol/SaksiRegistry.json");
const out = path.join(__dirname, "..", "src", "lib", "abi", "SaksiRegistry.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ abi: art.abi, bytecode: art.bytecode }, null, 2) + "\n");
console.log("wrote", path.relative(process.cwd(), out), `(${art.abi.length} ABI entries)`);
