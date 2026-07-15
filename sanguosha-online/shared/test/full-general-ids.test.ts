import { describe, expect, it } from "vitest";

import { FULL_GENERAL_CATALOG } from "../src/full-general-catalog.js";
import { FULL_GENERAL_IDS, isFullGeneralId } from "../src/full-general-ids.js";

describe("complete general id set", () => {
  it("matches the complete catalog in exact pack order", () => {
    expect(FULL_GENERAL_IDS).toHaveLength(66);
    expect(FULL_GENERAL_IDS).toEqual(FULL_GENERAL_CATALOG.map((general) => general.id));
    expect(new Set(FULL_GENERAL_IDS).size).toBe(66);
  });

  it("guards persisted general ids", () => {
    expect(isFullGeneralId("cao_cao")).toBe(true);
    expect(isFullGeneralId("shen_zhu_ge_liang")).toBe(true);
    expect(isFullGeneralId("unknown")).toBe(false);
  });
});
