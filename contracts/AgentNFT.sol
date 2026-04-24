// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentNFT — ERC-7857 Agentic Identity Token
 * @notice Each token represents an AI agent's cryptographic identity.
 *         iDatas store the agent's ed25519 public key hash and receipt chain root.
 */
contract AgentNFT {
    struct IData {
        string dataDescription;
        bytes32 dataHash;
    }

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    string public name = "RECEIPT Agent Identity";
    string public symbol = "RAGENT";

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => IData[]) private _tokenIDatas;
    mapping(uint256 => uint256) public mintedAt;

    function mint(IData[] calldata iDatas, address to) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        ownerOf[tokenId] = to;
        balanceOf[to]++;
        mintedAt[tokenId] = block.timestamp;

        for (uint256 i = 0; i < iDatas.length; i++) {
            _tokenIDatas[tokenId].push(iDatas[i]);
        }

        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }

    function getIDatas(uint256 tokenId) external view returns (IData[] memory) {
        require(ownerOf[tokenId] != address(0), "Token does not exist");
        return _tokenIDatas[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
