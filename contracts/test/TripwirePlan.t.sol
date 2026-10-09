// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";
import {
    Caveat,
    Delegation,
    IDelegationManager,
    IERC20,
    IUniV3Pool,
    ISwapRouter02,
    IWETH9,
    ModeCode
} from "../src/Types.sol";
import { TripwirePlanEnforcer } from "../src/TripwirePlanEnforcer.sol";
import { PlanBook } from "../src/PlanBook.sol";

/// Runs against a Monad mainnet fork: the real DelegationManager v1.3.0, EIP-7702 stateless delegator, Timestamp
/// enforcer, Uniswap V3 SwapRouter02 and the WMON/USDC 0.3% pool. Only the enforcer, the plan book and the actors are
/// ours. The holder's account is a 7702-delegated EOA that holds WMON and has approved the router, which is exactly
/// what the web app's setup transaction leaves behind.
///   forge test --fork-url $MONAD_RPC_URL --fork-block-number 109704919
contract TripwirePlanTest is Test {
    IDelegationManager constant DM = IDelegationManager(0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3);
    address constant DELEGATOR_IMPL = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    address constant TIMESTAMP = 0x1046bb45C8d673d4ea75321280DB34899413c069;
    address constant ROUTER = 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900;
    address constant POOL = 0x659bD0BC4167BA25c62E05656F78043E7eD4a9da;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    uint24 constant FEE = 3000;
    uint32 constant TWAP = 60;
    bytes32 constant ROOT = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    uint256 constant AMT0 = 1000 ether;
    uint256 constant AMT1 = 600 ether;
    uint256 constant AMT2 = 400 ether;
    uint256 constant MIN0 = 30_000; // USDC raw units per 1 MON; the pool pays about 34,276 at the pinned block
    uint256 constant MIN1 = 28_000;
    uint256 constant MIN2 = 25_000;
    uint256 constant PERPL_ACCOUNT = 741;
    uint256 constant PERPL_MARKET = 1;
    int256 constant PERPL_LOTS = 1_000_000_000;

    TripwirePlanEnforcer enforcer;
    PlanBook book;
    address owner;
    uint256 ownerPk;
    address keeper;

    function setUp() public {
        enforcer = new TripwirePlanEnforcer(address(DM));
        book = new PlanBook(DM, address(enforcer));
        (owner, ownerPk) = makeAddrAndKey("tripwire-holder");
        keeper = makeAddr("tripwire-keeper");
        vm.deal(owner, 5000 ether);
        vm.deal(keeper, 10 ether);
        vm.etch(owner, abi.encodePacked(hex"ef0100", DELEGATOR_IMPL));
        vm.startPrank(owner);
        IWETH9(WMON).deposit{ value: AMT0 + AMT1 + AMT2 }();
        IWETH9(WMON).approve(ROUTER, AMT0 + AMT1 + AMT2);
        vm.stopPrank();
    }

    // ---------- helpers ----------

    function _twap() internal view returns (int24) {
        return enforcer.monPriceTick(POOL, WMON, USDC, TWAP);
    }

    function _tranches(int24 l0, int24 l1, int24 l2) internal pure returns (TripwirePlanEnforcer.Tranche[] memory tr) {
        tr = new TripwirePlanEnforcer.Tranche[](3);
        tr[0] = TripwirePlanEnforcer.Tranche(l0, AMT0, MIN0, false);
        tr[1] = TripwirePlanEnforcer.Tranche(l1, AMT1, MIN1, false);
        tr[2] = TripwirePlanEnforcer.Tranche(l2, AMT2, MIN2, false);
    }

    function _sign(TripwirePlanEnforcer.Tranche[] memory tr, uint256 salt) internal view returns (Delegation memory d) {
        bytes memory terms = abi.encode(
            TripwirePlanEnforcer.Terms(ROUTER, POOL, WMON, USDC, FEE, TWAP, owner, PERPL_ACCOUNT, PERPL_MARKET, PERPL_LOTS, tr)
        );
        Caveat[] memory cv = new Caveat[](2);
        cv[0] = Caveat(address(enforcer), terms, "");
        cv[1] = Caveat(TIMESTAMP, abi.encodePacked(bytes16(0), bytes16(uint128(block.timestamp + 1 days))), "");
        d = Delegation(keeper, owner, ROOT, cv, salt, "");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DM.getDomainHash(), DM.getDelegationHash(d)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        d.signature = abi.encodePacked(r, s, v);
    }

    function _swap(address recipient, uint256 amountIn, uint256 minOut) internal pure returns (bytes memory) {
        return abi.encodeCall(
            ISwapRouter02.exactInputSingle,
            (ISwapRouter02.ExactInputSingleParams(WMON, USDC, FEE, recipient, amountIn, minOut, 0))
        );
    }

    function _redeem(Delegation memory d, bytes memory args, address target, uint256 value, bytes memory cd)
        internal
        returns (uint256 gasUsed)
    {
        d.caveats[0].args = args;
        Delegation[] memory chain = new Delegation[](1);
        chain[0] = d;
        bytes[] memory ctx = new bytes[](1);
        ctx[0] = abi.encode(chain);
        ModeCode[] memory modes = new ModeCode[](1);
        modes[0] = ModeCode.wrap(bytes32(0));
        bytes[] memory execs = new bytes[](1);
        execs[0] = abi.encodePacked(target, value, cd);
        vm.prank(keeper);
        uint256 g = gasleft();
        DM.redeemDelegations(ctx, modes, execs);
        gasUsed = g - gasleft();
    }

    function _plan(uint256 i) internal pure returns (uint256 amt, uint256 minPer) {
        (amt, minPer) = i == 0 ? (AMT0, MIN0) : i == 1 ? (AMT1, MIN1) : (AMT2, MIN2);
    }

    /// redeem tranche `i` exactly as signed
    function _fill(Delegation memory d, uint256 i) internal returns (uint256) {
        (uint256 amt, uint256 minPer) = _plan(i);
        return _redeem(d, abi.encode(i), ROUTER, 0, _swap(owner, amt, amt * minPer / 1 ether));
    }

    function _pushPriceDown() internal {
        address market = makeAddr("market-seller");
        vm.deal(market, 4_000_000 ether);
        vm.prank(market);
        ISwapRouter02(ROUTER).exactInputSingle{ value: 3_000_000 ether }(
            ISwapRouter02.ExactInputSingleParams(WMON, USDC, FEE, market, 3_000_000 ether, 0, 0)
        );
        vm.warp(block.timestamp + 120); // the whole 60 s window now sits after the move
    }

    function _bal() internal view returns (uint256 wmon, uint256 usdc) {
        return (IERC20(WMON).balanceOf(owner), IERC20(USDC).balanceOf(owner));
    }

    // ---------- the claim: one signature, three tranches, three lines ----------

    function test_staged_plan_fills_as_price_crosses_each_line() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 - 100, t0 - 1000), 1);
        (uint256 w0, uint256 u0) = _bal();
        uint256 mon0 = owner.balance;

        console.log("tranche 0 fill gas", _fill(d, 0));
        (uint256 w1, uint256 u1) = _bal();
        assertEq(w0 - w1, AMT0, "tranche 0 sold exactly its amount");
        assertGe(u1 - u0, AMT0 * MIN0 / 1 ether, "tranche 0 paid at least its floor");
        assertEq(owner.balance, mon0, "no native MON left the holder");
        assertTrue(enforcer.spent(DM.getDelegationHash(d), 0));

        vm.expectRevert(bytes("Tripwire:above-line"));
        _fill(d, 1);
        vm.expectRevert(bytes("Tripwire:above-line"));
        _fill(d, 2);

        _pushPriceDown();
        int24 t1 = _twap();
        assertLt(t1, t0 - 100, "market moved under line 1");
        assertGt(t1, t0 - 1000, "and stays above line 2");
        console.log("tranche 1 fill gas", _fill(d, 1));
        vm.expectRevert(bytes("Tripwire:above-line"));
        _fill(d, 2);
        (uint256 w2,) = _bal();
        assertEq(w0 - w2, AMT0 + AMT1, "two tranches sold, the third still held");
    }

    // ---------- every hostile redemption reverts with the enforcer's own reason ----------

    function test_hostile_keeper_reverts() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 - 1000), 2);
        (uint256 w0, uint256 u0) = _bal();

        vm.expectRevert(bytes("Tripwire:recipient"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(keeper, AMT0, AMT0 * MIN0 / 1 ether));
        vm.expectRevert(bytes("Tripwire:min-out"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, AMT0, 0));
        vm.expectRevert(bytes("Tripwire:min-out"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, AMT0, AMT1 * MIN2 / 1 ether));
        vm.expectRevert(bytes("Tripwire:amount"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, AMT0 + 1, (AMT0 + 1) * MIN0 / 1 ether));
        vm.expectRevert(bytes("Tripwire:amount"));
        _redeem(d, abi.encode(uint256(1)), ROUTER, 0, _swap(owner, AMT0, AMT0 * MIN1 / 1 ether));
        vm.expectRevert(bytes("Tripwire:value"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 1, _swap(owner, AMT0, AMT0 * MIN0 / 1 ether));
        vm.expectRevert(bytes("Tripwire:target"));
        _redeem(d, abi.encode(uint256(0)), keeper, 0, _swap(owner, AMT0, AMT0 * MIN0 / 1 ether));
        vm.expectRevert(bytes("Tripwire:above-line"));
        _fill(d, 2);
        vm.expectRevert(bytes("Tripwire:index"));
        _redeem(d, abi.encode(uint256(3)), ROUTER, 0, _swap(owner, AMT0, AMT0 * MIN0 / 1 ether));
        vm.expectRevert(bytes("Tripwire:args"));
        _redeem(d, "", ROUTER, 0, _swap(owner, AMT0, AMT0 * MIN0 / 1 ether));

        (uint256 w1, uint256 u1) = _bal();
        assertEq(w1, w0, "no hostile redemption moved WMON");
        assertEq(u1, u0, "or paid anything");

        _fill(d, 0);
        vm.expectRevert(bytes("Tripwire:spent"));
        _fill(d, 0);
    }

    function test_perpl_position_required() public {
        int24 t0 = _twap();
        TripwirePlanEnforcer.Tranche[] memory tr = _tranches(t0 + 200, t0 + 200, t0 - 1000);
        bytes memory terms =
            abi.encode(TripwirePlanEnforcer.Terms(ROUTER, POOL, WMON, USDC, FEE, TWAP, owner, 0, PERPL_MARKET, PERPL_LOTS, tr));
        Caveat[] memory cv = new Caveat[](2);
        cv[0] = Caveat(address(enforcer), terms, "");
        cv[1] = Caveat(TIMESTAMP, abi.encodePacked(bytes16(0), bytes16(uint128(block.timestamp + 1 days))), "");
        bytes32 h = keccak256("perpl-position-test");
        vm.prank(address(DM));
        vm.expectRevert(bytes("Tripwire:perpl-position"));
        enforcer.beforeHook(cv[0].terms, abi.encode(uint256(0)), ModeCode.wrap(0), "", h, owner, keeper);
    }

    function test_stranger_cannot_burn_tranches() public {
        Delegation memory d = _sign(_tranches(0, 0, 0), 3);
        bytes32 h = DM.getDelegationHash(d);
        vm.expectRevert(bytes("Tripwire:only-manager"));
        enforcer.beforeHook(d.caveats[0].terms, abi.encode(uint256(0)), ModeCode.wrap(0), "", h, owner, keeper);
        assertFalse(enforcer.spent(h, 0));
    }

    function test_terms_edited_after_signing_revert() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 4);
        TripwirePlanEnforcer.Tranche[] memory evil = _tranches(t0 + 200, t0 + 200, t0 + 200);
        d.caveats[0].terms = abi.encode(
            TripwirePlanEnforcer.Terms(ROUTER, POOL, WMON, USDC, FEE, TWAP, keeper, PERPL_ACCOUNT, PERPL_MARKET, PERPL_LOTS, evil)
        );
        vm.expectRevert();
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(keeper, AMT0, AMT0 * MIN0 / 1 ether));
    }

    function test_expired_plan_reverts() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 5);
        bytes32 h = DM.getDelegationHash(d);
        (uint256 w0, uint256 u0) = _bal();
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert();
        _fill(d, 0);
        (uint256 w1, uint256 u1) = _bal();
        assertEq(w1, w0, "expired attempt leaves WMON with the holder");
        assertEq(u1, u0, "expired attempt pays no stablecoin");
        assertFalse(enforcer.spent(h, 0), "expired attempt does not consume the tranche");
    }

    function test_holder_revokes_half_filled_plan() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 6);
        _fill(d, 0);
        vm.prank(owner);
        DM.disableDelegation(d);
        assertTrue(DM.disabledDelegations(DM.getDelegationHash(d)));
        vm.expectRevert();
        _fill(d, 1);
        (uint256 w,) = _bal();
        assertEq(w, AMT1 + AMT2, "revoked tranches stay with the holder");
    }

    // ---------- targets: sell once MON rises to the line ----------

    function _targets(int24 line) internal pure returns (TripwirePlanEnforcer.Tranche[] memory tr) {
        tr = new TripwirePlanEnforcer.Tranche[](3);
        tr[0] = TripwirePlanEnforcer.Tranche(line, AMT0, MIN0, true);
        tr[1] = TripwirePlanEnforcer.Tranche(line, AMT1, MIN1, true);
        tr[2] = TripwirePlanEnforcer.Tranche(line, AMT2, MIN2, true);
    }

    function test_target_sells_at_or_above_its_line() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_targets(t0 - 200), 20);
        (uint256 w0, uint256 u0) = _bal();
        _fill(d, 0);
        (uint256 w1, uint256 u1) = _bal();
        assertEq(w0 - w1, AMT0, "target sold exactly its amount");
        assertGe(u1 - u0, AMT0 * MIN0 / 1 ether, "and paid at least its floor");
    }

    function test_target_refused_before_price_reaches_it() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_targets(t0 + 200), 21);
        (uint256 w0,) = _bal();
        vm.expectRevert(bytes("Tripwire:below-line"));
        _fill(d, 0);
        (uint256 w1,) = _bal();
        assertEq(w1, w0);
    }

    function test_stop_and_target_in_one_plan_each_check_their_own_side() public {
        int24 t0 = _twap();
        TripwirePlanEnforcer.Tranche[] memory tr = new TripwirePlanEnforcer.Tranche[](2);
        tr[0] = TripwirePlanEnforcer.Tranche(t0 - 500, AMT0, MIN2, false); // stop far below: must not fire
        tr[1] = TripwirePlanEnforcer.Tranche(t0 + 500, AMT1, MIN1, true); // target far above: must not fire
        Delegation memory d = _sign(tr, 22);
        vm.expectRevert(bytes("Tripwire:above-line"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, AMT0, AMT0 * MIN2 / 1 ether));
        vm.expectRevert(bytes("Tripwire:below-line"));
        _fill(d, 1);
    }

    function test_exact_line_is_inclusive_for_stop_and_target() public {
        int24 line = _twap();
        TripwirePlanEnforcer.Tranche[] memory stop = new TripwirePlanEnforcer.Tranche[](1);
        stop[0] = TripwirePlanEnforcer.Tranche(line, 1 ether, MIN0, false);
        Delegation memory stopPlan = _sign(stop, 24);
        (uint256 w0, uint256 u0) = _bal();
        _redeem(stopPlan, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, 1 ether, MIN0));
        bytes32 stopHash = DM.getDelegationHash(stopPlan);
        assertTrue(enforcer.spent(stopHash, 0), "stop fills at equality");
        (uint256 w1, uint256 u1) = _bal();
        assertEq(w0 - w1, 1 ether);
        assertGe(u1 - u0, MIN0);
        assertEq(_twap(), line, "the target check uses the same boundary tick");

        TripwirePlanEnforcer.Tranche[] memory target = new TripwirePlanEnforcer.Tranche[](1);
        target[0] = TripwirePlanEnforcer.Tranche(line, 1 ether, MIN0, true);
        Delegation memory targetPlan = _sign(target, 25);
        _redeem(targetPlan, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, 1 ether, MIN0));
        bytes32 targetHash = DM.getDelegationHash(targetPlan);
        assertTrue(enforcer.spent(targetHash, 0), "target fills at equality");
        (uint256 w2, uint256 u2) = _bal();
        assertEq(w1 - w2, 1 ether);
        assertGe(u2 - u1, MIN0);
    }

    function test_changed_swap_assets_and_fee_revert_without_spending() public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 26);
        bytes32 h = DM.getDelegationHash(d);
        (uint256 w0, uint256 u0) = _bal();
        uint256 minOut = AMT0 * MIN0 / 1 ether;

        vm.expectRevert(bytes("Tripwire:route"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, abi.encodeCall(
            ISwapRouter02.exactInputSingle,
            (ISwapRouter02.ExactInputSingleParams(address(0x1234), USDC, FEE, owner, AMT0, minOut, 0))
        ));
        assertFalse(enforcer.spent(h, 0), "wrong input asset does not consume the tranche");

        vm.expectRevert(bytes("Tripwire:route"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, abi.encodeCall(
            ISwapRouter02.exactInputSingle,
            (ISwapRouter02.ExactInputSingleParams(WMON, address(0x5678), FEE, owner, AMT0, minOut, 0))
        ));
        assertFalse(enforcer.spent(h, 0), "wrong output asset does not consume the tranche");

        vm.expectRevert(bytes("Tripwire:route"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, abi.encodeCall(
            ISwapRouter02.exactInputSingle,
            (ISwapRouter02.ExactInputSingleParams(WMON, USDC, uint24(FEE + 1), owner, AMT0, minOut, 0))
        ));
        assertFalse(enforcer.spent(h, 0), "changed pool fee does not consume the tranche");

        (uint256 w1, uint256 u1) = _bal();
        assertEq(w1, w0, "route attacks move no WMON");
        assertEq(u1, u0, "route attacks pay no stablecoin");
        _fill(d, 0);
        assertTrue(enforcer.spent(h, 0), "the signed route still fills");
    }

    /// A target fills exactly when the MON price tick is at or above its line, and only then.
    function testFuzz_target_only_at_or_above_the_line(int24 offset) public {
        offset = int24(bound(int256(offset), -2000, 2000));
        int24 t0 = _twap();
        int24 line = t0 + offset;
        Delegation memory d = _sign(_targets(line), 23);
        (uint256 w0,) = _bal();
        if (t0 < line) {
            vm.expectRevert(bytes("Tripwire:below-line"));
            _fill(d, 0);
            (uint256 w1,) = _bal();
            assertEq(w1, w0);
        } else {
            _fill(d, 0);
            (uint256 w1,) = _bal();
            assertEq(w0 - w1, AMT0);
        }
    }

    // ---------- the plan book ----------

    function test_planbook_posts_and_counts() public {
        Delegation memory d = _sign(_tranches(0, 0, 0), 7);
        vm.prank(owner);
        uint256 id = book.post(d);
        assertEq(id, 0);
        assertEq(book.count(), 1);
        PlanBook.Plan memory p = book.plan(0);
        assertEq(p.holder, owner);
        assertEq(p.keeper, keeper);
        assertEq(p.delegationHash, DM.getDelegationHash(d));
        assertEq(book.plansOf(owner).length, 1);

        vm.prank(owner);
        vm.expectRevert(bytes("PlanBook:duplicate"));
        book.post(d);

        vm.prank(keeper);
        vm.expectRevert(bytes("PlanBook:not-delegator"));
        book.post(d);

        d.caveats[0].enforcer = TIMESTAMP;
        vm.prank(owner);
        vm.expectRevert(bytes("PlanBook:enforcer"));
        book.post(d);
    }

    // ---------- fuzz: the sell path ----------

    /// Any amount other than the signed tranche amount reverts, and nothing moves.
    function testFuzz_never_more_or_less_than_the_tranche(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, AMT0 + AMT1 + AMT2);
        vm.assume(amountIn != AMT0);
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 10);
        (uint256 w0, uint256 u0) = _bal();
        vm.expectRevert(bytes("Tripwire:amount"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, amountIn, amountIn * MIN0 / 1 ether + 1));
        (uint256 w1, uint256 u1) = _bal();
        assertEq(w1, w0);
        assertEq(u1, u0);
    }

    /// A min-out under the signed floor always reverts; at or over the floor the holder is paid at least the floor or
    /// the swap reverts. Either way the holder never receives less than floor for the tranche.
    function testFuzz_never_below_the_floor(uint256 minOut) public {
        minOut = bound(minOut, 0, AMT0 * 40_000 / 1 ether);
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 11);
        uint256 floor = AMT0 * MIN0 / 1 ether;
        (uint256 w0, uint256 u0) = _bal();
        if (minOut < floor) {
            vm.expectRevert(bytes("Tripwire:min-out"));
            _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(owner, AMT0, minOut));
            (uint256 w1, uint256 u1) = _bal();
            assertEq(w1, w0);
            assertEq(u1, u0);
            return;
        }
        d.caveats[0].args = abi.encode(uint256(0));
        try this.redeemExternal(d, _swap(owner, AMT0, minOut)) {
            (uint256 w1, uint256 u1) = _bal();
            assertEq(w0 - w1, AMT0);
            assertGe(u1 - u0, minOut);
            assertGe(u1 - u0, floor);
        } catch {
            (uint256 w1, uint256 u1) = _bal();
            assertEq(w1, w0, "a min-out the pool cannot pay sells nothing");
            assertEq(u1, u0);
        }
    }

    /// The proceeds can go nowhere but the signed recipient.
    function testFuzz_never_to_anyone_else(address to) public {
        vm.assume(to != owner);
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 12);
        vm.expectRevert(bytes("Tripwire:recipient"));
        _redeem(d, abi.encode(uint256(0)), ROUTER, 0, _swap(to, AMT0, AMT0 * MIN0 / 1 ether));
    }

    /// A tranche fills exactly when the MON price tick is at or below its line, and only then.
    function testFuzz_only_at_or_below_the_line(int24 offset) public {
        offset = int24(bound(int256(offset), -2000, 2000));
        int24 t0 = _twap();
        int24 line = t0 + offset;
        Delegation memory d = _sign(_tranches(line, line, line), 13);
        (uint256 w0,) = _bal();
        if (t0 > line) {
            vm.expectRevert(bytes("Tripwire:above-line"));
            _fill(d, 0);
            (uint256 w1,) = _bal();
            assertEq(w1, w0);
        } else {
            _fill(d, 0);
            (uint256 w1,) = _bal();
            assertEq(w0 - w1, AMT0);
        }
    }

    /// Whatever order and however often the keeper tries tranches, the total sold never exceeds the plan, and each
    /// tranche is sold at most once.
    function testFuzz_never_more_than_the_plan(uint8[8] memory order) public {
        int24 t0 = _twap();
        Delegation memory d = _sign(_tranches(t0 + 200, t0 + 200, t0 + 200), 14);
        (uint256 w0,) = _bal();
        bool[3] memory done;
        uint256 sold;
        for (uint256 k; k < order.length; k++) {
            uint256 i = order[k] % 3;
            if (done[i]) {
                vm.expectRevert(bytes("Tripwire:spent"));
                _fill(d, i);
            } else {
                _fill(d, i);
                done[i] = true;
                (uint256 amt,) = _plan(i);
                sold += amt;
            }
            (uint256 w,) = _bal();
            assertEq(w0 - w, sold);
            assertLe(w0 - w, AMT0 + AMT1 + AMT2);
        }
    }

    function redeemExternal(Delegation memory d, bytes memory cd) external {
        Delegation[] memory chain = new Delegation[](1);
        chain[0] = d;
        bytes[] memory ctx = new bytes[](1);
        ctx[0] = abi.encode(chain);
        ModeCode[] memory modes = new ModeCode[](1);
        bytes[] memory execs = new bytes[](1);
        execs[0] = abi.encodePacked(ROUTER, uint256(0), cd);
        vm.prank(keeper);
        DM.redeemDelegations(ctx, modes, execs);
    }
}
