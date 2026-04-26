// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ValidationRegistry — ERC-8004 Validation Registry (minimal)
 * @notice Implements the core of ERC-8004's Validation Registry for agent proof attestations.
 *         Validators post execution proofs; anyone can query validation history per agent.
 */
contract ValidationRegistry {
    struct ValidationRequest {
        address validatorAddress;
        uint256 agentId;
        string requestURI;
        bytes32 requestHash;
        uint256 timestamp;
    }

    struct ValidationResponse {
        uint8 response;
        string responseURI;
        bytes32 responseHash;
        string tag;
        uint256 timestamp;
    }

    event ValidationRequested(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponded(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    mapping(bytes32 => ValidationRequest) public requests;
    mapping(bytes32 => ValidationResponse) public responses;
    mapping(uint256 => bytes32[]) public agentValidations;
    mapping(address => bytes32[]) public validatorRequests;

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(requests[requestHash].timestamp == 0, "Request exists");
        requests[requestHash] = ValidationRequest(
            validatorAddress, agentId, requestURI, requestHash, block.timestamp
        );
        agentValidations[agentId].push(requestHash);
        validatorRequests[validatorAddress].push(requestHash);
        emit ValidationRequested(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationRequest memory req = requests[requestHash];
        require(req.timestamp > 0, "No such request");
        require(msg.sender == req.validatorAddress, "Not validator");
        require(responses[requestHash].timestamp == 0, "Already responded");
        require(response <= 100, "Score 0-100");

        responses[requestHash] = ValidationResponse(
            response, responseURI, responseHash, tag, block.timestamp
        );
        emit ValidationResponded(
            msg.sender, req.agentId, requestHash,
            response, responseURI, responseHash, tag
        );
    }

    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    ) {
        ValidationRequest memory req = requests[requestHash];
        ValidationResponse memory res = responses[requestHash];
        return (
            req.validatorAddress,
            req.agentId,
            res.response,
            res.responseHash,
            res.tag,
            res.timestamp > 0 ? res.timestamp : req.timestamp
        );
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return validatorRequests[validatorAddress];
    }

    function requestExists(bytes32 requestHash) external view returns (bool) {
        return requests[requestHash].timestamp > 0;
    }
}
