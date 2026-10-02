import { expect, test } from "bun:test";
import { parsePlanLink, planLink } from "./link";

test("parses the shared link format", () => {
  const { tranches, errors } = parsePlanLink("?sell=1@0.033/0.030,0.5@0.028/0.025");
  expect(errors).toEqual([]);
  expect(tranches).toEqual([
    { mon: "1", line: 0.033, floor: 0.03 },
    { mon: "0.5", line: 0.028, floor: 0.025 },
  ]);
});

test("round trips", () => {
  const t = [{ mon: "2.5", line: 0.031, floor: 0.029 }];
  expect(parsePlanLink(new URL(planLink("https://x.test/", t)).search).tranches).toEqual(t);
});

test("refuses a floor above its line and malformed parts, keeps the good ones", () => {
  const { tranches, errors } = parsePlanLink("?sell=1@0.03/0.031,abc,0.2@0.03/0.02");
  expect(tranches).toEqual([{ mon: "0.2", line: 0.03, floor: 0.02 }]);
  expect(errors.length).toBe(2);
});

test("caps at three tranches and is empty without the parameter", () => {
  expect(parsePlanLink("?sell=1@1/1,1@1/1,1@1/1,1@1/1").tranches.length).toBe(3);
  expect(parsePlanLink("?x=1")).toEqual({ tranches: [], errors: [] });
});
