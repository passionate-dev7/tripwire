// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Shapes from MetaMask's delegation framework (DelegationManager v1.3.0) and Uniswap V3, declared locally so the
/// product compiles without either repository. Field order must match the deployed contracts exactly.

type ModeCode is bytes32;

struct Caveat {
    address enforcer;
    bytes terms;
    bytes args;
}

struct Delegation {
    address delegate;
    address delegator;
    bytes32 authority;
    Caveat[] caveats;
    uint256 salt;
    bytes signature;
}

interface IDelegationManager {
    function redeemDelegations(bytes[] calldata, ModeCode[] calldata, bytes[] calldata) external;
    function disableDelegation(Delegation calldata) external;
    function disabledDelegations(bytes32) external view returns (bool);
    function getDomainHash() external view returns (bytes32);
    function getDelegationHash(Delegation calldata) external pure returns (bytes32);
}

interface IUniV3Pool {
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory, uint160[] memory);
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IWETH9 is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}
