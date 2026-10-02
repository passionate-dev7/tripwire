// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IUniV3PoolMint {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1);
}

interface IERC20From {
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @notice Adds liquidity to a Uniswap V3 pool from the owner's balances without the NonfungiblePositionManager. The
/// position belongs to the owner, who burns and collects it on the pool directly. The callback pays only the pool
/// that this contract is minting into right now, so its token approvals cannot be pulled by anyone else.
contract PoolSeeder {
    address public immutable owner;
    address private active;

    constructor() {
        owner = msg.sender;
    }

    function mint(address pool, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        require(msg.sender == owner, "Seeder:owner");
        active = pool;
        (amount0, amount1) = IUniV3PoolMint(pool).mint(owner, tickLower, tickUpper, liquidity, "");
        active = address(0);
    }

    function uniswapV3MintCallback(uint256 amount0, uint256 amount1, bytes calldata) external {
        require(msg.sender == active && active != address(0), "Seeder:pool");
        if (amount0 != 0) require(IERC20From(IUniV3PoolMint(msg.sender).token0()).transferFrom(owner, msg.sender, amount0));
        if (amount1 != 0) require(IERC20From(IUniV3PoolMint(msg.sender).token1()).transferFrom(owner, msg.sender, amount1));
    }
}
