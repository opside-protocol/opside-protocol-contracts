// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.17;

interface IRollupIdInfo {
    function getL1BridgeAddress(uint32 _rollupId) external view returns (address);
}