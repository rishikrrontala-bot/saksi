// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SaksiRegistry} from "../src/SaksiRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
/// MINISTRY_ENC_PUBKEY is the ministry's X25519 key, derived by scripts/deploy.ts from the deployer's signature.
contract Deploy is Script {
    function run() external returns (SaksiRegistry registry) {
        bytes32 ministryKey = vm.envBytes32("MINISTRY_ENC_PUBKEY");
        vm.startBroadcast();
        registry = new SaksiRegistry(ministryKey);
        vm.stopBroadcast();
        console.log("SaksiRegistry deployed at", address(registry));
    }
}
