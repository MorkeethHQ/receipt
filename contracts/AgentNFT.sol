// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentNFT — ERC-7857 Agentic Identity Token
 * @notice Each token represents an AI agent's cryptographic identity.
 *         iDatas store the agent's ed25519 public key hash and receipt chain root.
 *         Implements transfer, clone, and authorizeUsage per ERC-7857 spec.
 */
contract AgentNFT {
    struct IData {
        string dataDescription;
        bytes32 dataHash;
    }

    struct UsageAuthorization {
        address authorized;
        uint256 tokenId;
        uint256 expiresAt;
        bool revoked;
    }

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Clone(uint256 indexed originalTokenId, uint256 indexed cloneTokenId, address indexed cloneOwner);
    event UsageAuthorized(uint256 indexed tokenId, address indexed authorized, uint256 expiresAt);
    event UsageRevoked(uint256 indexed tokenId, address indexed authorized);

    string public name = "RECEIPT Agent Identity";
    string public symbol = "RAGENT";

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => IData[]) private _tokenIDatas;
    mapping(uint256 => uint256) public mintedAt;
    mapping(uint256 => uint256) public clonedFrom;
    mapping(uint256 => UsageAuthorization[]) private _usageAuths;

    modifier onlyOwner(uint256 tokenId) {
        require(ownerOf[tokenId] == msg.sender, "Not token owner");
        _;
    }

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

    function transfer(address to, uint256 tokenId) external onlyOwner(tokenId) {
        require(to != address(0), "Transfer to zero address");
        address from = msg.sender;
        balanceOf[from]--;
        balanceOf[to]++;
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function clone(uint256 tokenId, IData[] calldata additionalIDatas, address to) external onlyOwner(tokenId) returns (uint256) {
        require(ownerOf[tokenId] != address(0), "Token does not exist");

        uint256 cloneId = _nextTokenId++;
        ownerOf[cloneId] = to;
        balanceOf[to]++;
        mintedAt[cloneId] = block.timestamp;
        clonedFrom[cloneId] = tokenId;

        IData[] storage originalDatas = _tokenIDatas[tokenId];
        for (uint256 i = 0; i < originalDatas.length; i++) {
            _tokenIDatas[cloneId].push(originalDatas[i]);
        }
        for (uint256 i = 0; i < additionalIDatas.length; i++) {
            _tokenIDatas[cloneId].push(additionalIDatas[i]);
        }

        emit Clone(tokenId, cloneId, to);
        emit Transfer(address(0), to, cloneId);
        return cloneId;
    }

    function authorizeUsage(uint256 tokenId, address authorized, uint256 durationSeconds) external onlyOwner(tokenId) {
        uint256 expiresAt = block.timestamp + durationSeconds;
        _usageAuths[tokenId].push(UsageAuthorization({
            authorized: authorized,
            tokenId: tokenId,
            expiresAt: expiresAt,
            revoked: false
        }));
        emit UsageAuthorized(tokenId, authorized, expiresAt);
    }

    function revokeUsage(uint256 tokenId, address authorized) external onlyOwner(tokenId) {
        UsageAuthorization[] storage auths = _usageAuths[tokenId];
        for (uint256 i = 0; i < auths.length; i++) {
            if (auths[i].authorized == authorized && !auths[i].revoked) {
                auths[i].revoked = true;
                emit UsageRevoked(tokenId, authorized);
            }
        }
    }

    function isAuthorized(uint256 tokenId, address user) external view returns (bool) {
        if (ownerOf[tokenId] == user) return true;
        UsageAuthorization[] storage auths = _usageAuths[tokenId];
        for (uint256 i = 0; i < auths.length; i++) {
            if (auths[i].authorized == user && !auths[i].revoked && auths[i].expiresAt > block.timestamp) {
                return true;
            }
        }
        return false;
    }

    function getIDatas(uint256 tokenId) external view returns (IData[] memory) {
        require(ownerOf[tokenId] != address(0), "Token does not exist");
        return _tokenIDatas[tokenId];
    }

    function getUsageAuthorizations(uint256 tokenId) external view returns (UsageAuthorization[] memory) {
        return _usageAuths[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
