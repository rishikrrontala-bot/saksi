require("@nomicfoundation/hardhat-viem");

/** Hardhat compiles and tests the contract; deployment is done by ../scripts/deploy.mjs with viem. */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  paths: { sources: "./src", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
