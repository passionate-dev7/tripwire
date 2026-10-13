import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { apiBase, currentNet, netFrom } from "./net";
import { MAINNET, TESTNET, mainnetNet } from "./plan";

const env = { ...process.env };
afterEach(() => {
  for (const k of ["NEXT_PUBLIC_TRIPWIRE_NET", "NEXT_PUBLIC_KEEPER_API", "NEXT_PUBLIC_KEEPER_API_MAINNET"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  delete (globalThis as { window?: unknown }).window;
});

describe("currentNet", () => {
  test("defaults to testnet", () => {
    delete process.env.NEXT_PUBLIC_TRIPWIRE_NET;
    expect(currentNet().key).toBe("testnet");
    expect(currentNet().chainId).toBe(10143);
  });
  test("the build default can pick mainnet", () => {
    process.env.NEXT_PUBLIC_TRIPWIRE_NET = "mainnet";
    expect(currentNet().chainId).toBe(143);
  });
  test("?net=mainnet in the address beats a testnet default, ?net=testnet beats a mainnet default", () => {
    (globalThis as { window?: unknown }).window = { location: { search: "?sell=1@0.03/0.02&net=mainnet" } };
    expect(currentNet().key).toBe("mainnet");
    process.env.NEXT_PUBLIC_TRIPWIRE_NET = "mainnet";
    (globalThis as { window?: unknown }).window = { location: { search: "?net=testnet" } };
    expect(currentNet().key).toBe("testnet");
  });
  test("an unknown value falls back to the default instead of guessing", () => {
    expect(netFrom("?net=goerli", undefined).key).toBe("testnet");
    expect(netFrom("?net=goerli", "mainnet").key).toBe("mainnet");
    expect(netFrom("", "polygon").key).toBe("testnet");
  });
});

describe("api base", () => {
  test("testnet keeps /api, mainnet goes through /api/mainnet", () => {
    delete process.env.NEXT_PUBLIC_KEEPER_API;
    delete process.env.NEXT_PUBLIC_KEEPER_API_MAINNET;
    expect(apiBase(TESTNET)).toBe("/api");
    expect(apiBase(MAINNET)).toBe("/api/mainnet");
  });
  test("development points each net at its own keeper", () => {
    process.env.NEXT_PUBLIC_KEEPER_API = "http://127.0.0.1:3511";
    expect(apiBase(MAINNET)).toBe("http://127.0.0.1:3511/api/mainnet");
    process.env.NEXT_PUBLIC_KEEPER_API_MAINNET = "http://127.0.0.1:3512";
    expect(apiBase(MAINNET)).toBe("http://127.0.0.1:3512/api");
    expect(apiBase(TESTNET)).toBe("http://127.0.0.1:3511/api");
  });
});

describe("mainnet deployment record", () => {
  const dep = { enforcer: "0x4c594690108f808d9e5603df548740b22e82703e", planBook: "0xa3157a5a011404a70c033834a19826a9628e6928", planBookFromBlock: 113037155 };
  test("without both contracts the net is marked not deployed and carries no half address", () => {
    for (const d of [null, {}, { enforcer: dep.enforcer }, { planBook: dep.planBook, planBookFromBlock: 1 }]) {
      const n = mainnetNet(d);
      expect(n.deployed).toBe(false);
      expect(BigInt(n.enforcer)).toBe(0n);
      expect(BigInt(n.planBook)).toBe(0n);
    }
  });
  test("with both it is deployed on chain 143 with the real venue", () => {
    const n = mainnetNet(dep);
    expect(n.deployed).toBe(true);
    expect(n.chainId).toBe(143);
    expect(n.enforcer.toLowerCase()).toBe(dep.enforcer);
    expect(n.planBookFromBlock).toBe(113037155n);
    expect([n.stableSymbol, n.fee, n.twapSeconds, n.explorer]).toEqual(["USDC", 3000, 60, "https://monadvision.com"]);
    expect(n.stable.toLowerCase()).toBe("0x754704bc059f8c67012fed69bc8a327a5aafb603");
  });
  test("web/lib/mainnet.json agrees with contracts/deployments/143.json", () => {
    const file = path.join(import.meta.dir, "..", "..", "contracts", "deployments", "143.json");
    const mirror = MAINNET;
    if (!fs.existsSync(file)) return expect(mirror.deployed).toBe(false);
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(mirror.deployed).toBe(true);
    expect(mirror.enforcer.toLowerCase()).toBe(String(d.enforcer).toLowerCase());
    expect(mirror.planBook.toLowerCase()).toBe(String(d.planBook).toLowerCase());
    expect(mirror.planBookFromBlock).toBe(BigInt(d.planBookFromBlock));
  });
});
