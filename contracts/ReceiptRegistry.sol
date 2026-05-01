// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReceiptRegistry — On-chain coordination for agent receipt chains
 * @notice Maps wallet addresses to their registered receipt chains.
 *         Dashboard reads directly from this contract. No centralized storage.
 */
contract ReceiptRegistry {
    struct Chain {
        bytes32 rootHash;
        uint8 qualityScore;
        string agentId;
        string source;
        uint16 receiptCount;
        uint256 timestamp;
        bytes32 anchorRef;
    }

    event ChainRegistered(
        address indexed owner,
        bytes32 indexed rootHash,
        string agentId,
        string source,
        uint8 qualityScore,
        uint16 receiptCount,
        uint256 timestamp
    );

    mapping(address => Chain[]) private _ownerChains;
    uint256 public totalChains;

    function registerChain(
        bytes32 rootHash,
        uint8 qualityScore,
        string calldata agentId,
        string calldata source,
        uint16 receiptCount,
        bytes32 anchorRef
    ) external {
        require(qualityScore <= 100, "Score 0-100");
        require(receiptCount > 0, "Empty chain");

        _ownerChains[msg.sender].push(Chain({
            rootHash: rootHash,
            qualityScore: qualityScore,
            agentId: agentId,
            source: source,
            receiptCount: receiptCount,
            timestamp: block.timestamp,
            anchorRef: anchorRef
        }));

        totalChains++;

        emit ChainRegistered(
            msg.sender,
            rootHash,
            agentId,
            source,
            qualityScore,
            receiptCount,
            block.timestamp
        );
    }

    function getChainCount(address owner) external view returns (uint256) {
        return _ownerChains[owner].length;
    }

    function getChain(address owner, uint256 index) external view returns (
        bytes32 rootHash,
        uint8 qualityScore,
        string memory agentId,
        string memory source,
        uint16 receiptCount,
        uint256 timestamp,
        bytes32 anchorRef
    ) {
        Chain memory c = _ownerChains[owner][index];
        return (c.rootHash, c.qualityScore, c.agentId, c.source, c.receiptCount, c.timestamp, c.anchorRef);
    }

    function getChains(address owner) external view returns (Chain[] memory) {
        return _ownerChains[owner];
    }

    function getTotalChains() external view returns (uint256) {
        return totalChains;
    }
}
