// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReceiptAnchorV2 {
    event RootAnchored(
        bytes32 indexed chainRootHash,
        bytes32 storageRef,
        uint8 usefulnessScore,
        address indexed sender,
        uint256 timestamp
    );

    struct Anchor {
        bytes32 storageRef;
        uint8 usefulnessScore;
        address sender;
        uint256 timestamp;
    }

    mapping(bytes32 => Anchor) public anchors;

    function anchorRoot(bytes32 chainRootHash, bytes32 storageRef, uint8 usefulnessScore) external {
        require(anchors[chainRootHash].timestamp == 0, "Already anchored");
        require(usefulnessScore <= 100, "Score must be 0-100");
        anchors[chainRootHash] = Anchor(storageRef, usefulnessScore, msg.sender, block.timestamp);
        emit RootAnchored(chainRootHash, storageRef, usefulnessScore, msg.sender, block.timestamp);
    }

    function getAnchor(bytes32 chainRootHash) external view returns (
        bytes32 storageRef,
        uint8 usefulnessScore,
        address sender,
        uint256 timestamp
    ) {
        Anchor memory a = anchors[chainRootHash];
        return (a.storageRef, a.usefulnessScore, a.sender, a.timestamp);
    }

    function isAnchored(bytes32 chainRootHash) external view returns (bool) {
        return anchors[chainRootHash].timestamp > 0;
    }
}
