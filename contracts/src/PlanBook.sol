// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Delegation, IDelegationManager } from "./Types.sol";

/// @notice Where a holder publishes a signed tripwire plan so any keeper can find it. Only the delegator can post its
/// own delegation, and only one whose first caveat is the tripwire enforcer. The full signed delegation travels in the
/// event; storage keeps the holder, keeper, time and hash, so the plan count and a holder's plans are contract reads.
/// Posting grants nothing: the delegation is already signed, and the enforcer bounds every fill of it.
contract PlanBook {
    struct Plan {
        address holder;
        address keeper;
        uint64 postedAt;
        bytes32 delegationHash;
    }

    event PlanPosted(
        uint256 indexed id, address indexed holder, address indexed keeper, bytes32 delegationHash, bytes delegation
    );

    IDelegationManager public immutable manager;
    address public immutable enforcer;

    Plan[] internal _plans;
    mapping(address holder => uint256[]) internal _byHolder;
    mapping(bytes32 delegationHash => bool) public posted;

    constructor(IDelegationManager _manager, address _enforcer) {
        manager = _manager;
        enforcer = _enforcer;
    }

    function post(Delegation calldata d) external returns (uint256 id) {
        require(msg.sender == d.delegator, "PlanBook:not-delegator");
        require(d.caveats.length != 0 && d.caveats[0].enforcer == enforcer, "PlanBook:enforcer");
        bytes32 h = manager.getDelegationHash(d);
        require(!posted[h], "PlanBook:duplicate");
        posted[h] = true;
        id = _plans.length;
        _plans.push(Plan(d.delegator, d.delegate, uint64(block.timestamp), h));
        _byHolder[d.delegator].push(id);
        emit PlanPosted(id, d.delegator, d.delegate, h, abi.encode(d));
    }

    function count() external view returns (uint256) {
        return _plans.length;
    }

    function plan(uint256 id) external view returns (Plan memory) {
        return _plans[id];
    }

    function plansOf(address holder) external view returns (uint256[] memory) {
        return _byHolder[holder];
    }
}
