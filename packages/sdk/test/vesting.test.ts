import { describe, expect, it, vi } from "vitest";

// rpc.Server and Contract are network-bound constructors; the revoke test
// drives BaseClient.prepare through light fakes so no RPC endpoint is needed.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  class FakeServer {
    async getAccount(publicKey: string) {
      return new actual.Account(publicKey, "123");
    }
    async simulateTransaction() {
      return {
        _parsed: true,
        latestLedger: 1,
        events: [],
        transactionData: "",
        minResourceFee: "0",
        cost: { transactionSizeBytes: "0", inclusionFee: { total: "0" } },
        // A native i128 scval; scValToNative turns it into a bigint.
        result: {
          auth: [],
          retval: actual.nativeToScVal(750n, { type: "i128" }),
        },
      };
    }
  }
  class FakeContract {
    constructor(_contractId: string) {}
    call(method: string, ...args: unknown[]) {
      return { method, args };
    }
  }
  class FakeTransactionBuilder {
    constructor(_source: unknown, _opts: unknown) {}
    addOperation(_op: unknown) {
      return this;
    }
    setTimeout(_seconds: number) {
      return this;
    }
    build() {
      return { toXDR: () => "AAAA" };
    }
  }
  return {
    ...actual,
    rpc: { ...actual.rpc, Server: FakeServer },
    Contract: FakeContract,
    TransactionBuilder: FakeTransactionBuilder,
  };
});

import { VestingClient } from "../src/clients/vesting.js";

const CONTRACT = "CCONTRACTADDRESSFORTESTINGONLYXXXXXXXXXXXXXXXXXXXXXX";
const ACCOUNT = "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";

function client(): VestingClient {
  return new VestingClient({
    contractId: CONTRACT,
    rpcUrl: "http://localhost:8000",
    networkPassphrase: "Test SoroRail Network ; July 2026",
    publicKey: ACCOUNT,
    allowHttp: true,
  });
}

describe("VestingClient.revoke (#33)", () => {
  it("simulates the revoke call and parses the returned amount as a bigint", async () => {
    const call = await client().revoke();
    const amount = await call.simulate();

    expect(typeof amount).toBe("bigint");
    expect(amount).toBe(750n);
  });

  it("prepares a no-argument revoke against the vesting contract", async () => {
    const fake = client();
    const prepareSpy = vi.spyOn(
      fake as unknown as {
        prepare: (
          method: string,
          args: unknown[],
          parse: (value: unknown) => unknown,
        ) => Promise<{ simulate: () => Promise<unknown> }>;
      },
      "prepare",
    );

    const call = await fake.revoke();
    expect(prepareSpy).toHaveBeenCalledWith("revoke", [], expect.any(Function));

    // The same call still decodes through the shared amount parser.
    await expect(call.simulate()).resolves.toBe(750n);
    prepareSpy.mockRestore();
  });
});

describe("VestingClient.claimable (#35)", () => {
  it("simulates the claimable read and parses the returned amount as a bigint", async () => {
    const amount = await client().claimable();

    expect(typeof amount).toBe("bigint");
    expect(amount).toBe(750n);
  });

  it("invokes the read path with method 'claimable' and no arguments", async () => {
    const fake = client();
    const readSpy = vi.spyOn(
      fake as unknown as {
        read: (
          method: string,
          args: unknown[],
          parse: (value: unknown) => unknown,
        ) => Promise<unknown>;
      },
      "read",
    );

    await fake.claimable();

    expect(readSpy).toHaveBeenCalledWith("claimable", [], expect.any(Function));
    readSpy.mockRestore();
  });
});
