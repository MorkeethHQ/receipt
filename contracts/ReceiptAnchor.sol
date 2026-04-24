// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReceiptAnchor {
    event RootAnchored(
        bytes32 indexed chainRootHash,
        bytes32 storageRef,
        address indexed sender,
        uint256 timestamp
    );

    mapping(bytes32 => bool) public anchored;

    function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external {
        require(!anchored[chainRootHash], "Already anchored");
        anchored[chainRootHash] = true;
        emit RootAnchored(chainRootHash, storageRef, msg.sender, block.timestamp);
    }

    function isAnchored(bytes32 chainRootHash) external view returns (bool) {
        return anchored[chainRootHash];
    }
}
