// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ModeCode, IUniV3Pool } from "./Types.sol";

/// @notice Caveat enforcer for MetaMask's DelegationManager. One signed delegation carries a holder's whole exit plan:
/// up to MAX_TRANCHES sell tranches, each (lineTick, amountIn, minOutPerUnit). A keeper may fill a tranche once, and
/// only through this exact call:
///  - target is the signed Uniswap V3 SwapRouter02, selector exactInputSingle, route WMON to the signed stablecoin at
///    the signed fee, native value 0 (WMON is pulled as an ERC-20, so Monad's reserve balance rule never applies);
///  - recipient is the signed recipient (the holder);
///  - amountIn is exactly the tranche amount;
///  - amountOutMinimum pays at least minOutPerUnit stablecoin units per 1 WMON (the floor, so a sandwich cannot fill it);
///  - the MON price tick, TWAP over twapSeconds (spot when 0), is at or below the tranche's lineTick (the line).
/// The keeper names the tranche in the caveat args, which are not signed. Fills are recorded per (delegationHash,
/// index); a revert anywhere in the redemption rolls the record back. Only the DelegationManager may call beforeHook,
/// because the hook writes storage and anyone else could otherwise burn a holder's tranches.
contract TripwirePlanEnforcer {
    bytes4 internal constant EXACT_INPUT_SINGLE = 0x04e45aaf;
    uint256 public constant MAX_TRANCHES = 16;

    struct Tranche {
        int24 lineTick;
        uint256 amountIn;
        uint256 minOutPerUnit;
    }

    struct Terms {
        address router;
        address pool;
        address wmon;
        address usdc;
        uint24 fee;
        uint32 twapSeconds;
        address recipient;
        Tranche[] tranches;
    }

    event TrancheFilled(
        bytes32 indexed delegationHash,
        address indexed recipient,
        uint256 indexed index,
        uint256 amountIn,
        uint256 amountOutMinimum,
        int24 priceTick
    );

    address public immutable delegationManager;
    mapping(bytes32 delegationHash => mapping(uint256 index => bool)) public spent;

    constructor(address _delegationManager) {
        delegationManager = _delegationManager;
    }

    function beforeAllHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address) external { }

    function afterHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address) external { }

    function afterAllHook(bytes calldata, bytes calldata, ModeCode, bytes calldata, bytes32, address, address) external { }

    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _exec,
        bytes32 _delegationHash,
        address,
        address
    )
        external
    {
        require(msg.sender == delegationManager, "Tripwire:only-manager");
        require(ModeCode.unwrap(_mode) == bytes32(0), "Tripwire:mode");
        Terms memory t = abi.decode(_terms, (Terms));
        require(t.tranches.length != 0 && t.tranches.length <= MAX_TRANCHES, "Tripwire:plan-size");

        require(_args.length == 32, "Tripwire:args");
        uint256 index = abi.decode(_args, (uint256));
        require(index < t.tranches.length, "Tripwire:index");
        require(!spent[_delegationHash][index], "Tripwire:spent");
        spent[_delegationHash][index] = true;
        Tranche memory tr = t.tranches[index];

        (uint256 amountIn, uint256 amountOutMin) = _checkSwap(t, tr, _exec);
        int24 priceTick = monPriceTick(t.pool, t.wmon, t.usdc, t.twapSeconds);
        require(priceTick <= tr.lineTick, "Tripwire:above-line");

        emit TrancheFilled(_delegationHash, t.recipient, index, amountIn, amountOutMin, priceTick);
    }

    /// single execution: target (20) | value (32) | exactInputSingle calldata
    function _checkSwap(Terms memory t, Tranche memory tr, bytes calldata _exec)
        internal
        pure
        returns (uint256 amountIn, uint256 amountOutMin)
    {
        require(_exec.length >= 52 + 4 + 7 * 32, "Tripwire:exec-length");
        require(address(bytes20(_exec[0:20])) == t.router, "Tripwire:target");
        bytes calldata cd = _exec[52:];
        require(bytes4(cd[0:4]) == EXACT_INPUT_SINGLE, "Tripwire:selector");
        require(cd.length == 4 + 7 * 32, "Tripwire:calldata-length");
        require(uint256(bytes32(_exec[20:52])) == 0, "Tripwire:value");

        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        (tokenIn, tokenOut, fee, recipient, amountIn, amountOutMin,) =
            abi.decode(cd[4:], (address, address, uint24, address, uint256, uint256, uint160));

        require(tokenIn == t.wmon && tokenOut == t.usdc && fee == t.fee, "Tripwire:route");
        require(recipient == t.recipient, "Tripwire:recipient");
        require(amountIn == tr.amountIn, "Tripwire:amount");
        require(amountOutMin * 1 ether >= amountIn * tr.minOutPerUnit, "Tripwire:min-out");
    }

    /// @notice The pool's tick oriented so that a higher value always means a higher MON price in the stablecoin.
    /// Uniswap prices token1 in token0, so when WMON sorts after the stablecoin the raw tick is negated.
    function monPriceTick(address pool, address wmon, address usdc, uint32 twapSeconds) public view returns (int24) {
        int24 raw = _tick(pool, twapSeconds);
        return wmon < usdc ? raw : -raw;
    }

    function _tick(address pool, uint32 twapSeconds) internal view returns (int24) {
        if (twapSeconds == 0) {
            (, int24 spot,,,,,) = IUniV3Pool(pool).slot0();
            return spot;
        }
        uint32[] memory ago = new uint32[](2);
        ago[0] = twapSeconds;
        (int56[] memory cum,) = IUniV3Pool(pool).observe(ago);
        int56 delta = cum[1] - cum[0];
        int24 avg = int24(delta / int56(uint56(twapSeconds)));
        if (delta < 0 && delta % int56(uint56(twapSeconds)) != 0) avg--;
        return avg;
    }
}
