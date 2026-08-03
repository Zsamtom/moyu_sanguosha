import { Router } from "express";
import { z } from "zod";
import {
  ALL_MINE_DEPOSIT_IDS,
  ESTATE_TOWN_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type { FarmService, MineClientAction } from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const depositIdSchema = z.enum(ALL_MINE_DEPOSIT_IDS);
const townIdSchema = z.enum(ESTATE_TOWN_IDS);
const shaftIndexSchema = z.number().int().min(0).max(5);
const quantitySchema = z.number().int().min(1).max(99);

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mine_start"),
    depositId: depositIdSchema,
    shaftIndex: shaftIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("mine_reinforce"),
    shaftIndex: shaftIndexSchema,
  }).strict(),
  z.object({ type: z.literal("mine_reinforce_all") }).strict(),
  z.object({
    type: z.literal("mine_abandon"),
    shaftIndex: shaftIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("mine_collect"),
    shaftIndex: shaftIndexSchema,
  }).strict(),
  z.object({ type: z.literal("mine_collect_all") }).strict(),
  z.object({
    type: z.literal("mine_sell"),
    depositId: depositIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({ type: z.literal("mine_expand_shaft") }).strict(),
  z.object({ type: z.literal("mine_upgrade_pickaxe") }).strict(),
]);

export const mineActionEnvelopeSchema = z.object({
  townId: townIdSchema,
  expectedFarmRevision: z.number().int().nonnegative(),
  expectedRanchRevision: z.number().int().nonnegative(),
  expectedMineRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export function createMineRouter(farm: FarmService): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.getOrCreateMine(currentUser(response)));
  }));

  router.post("/actions", asyncHandler(async (request, response) => {
    const input = mineActionEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyMineAction(
      currentUser(response),
      input.expectedFarmRevision,
      input.expectedRanchRevision,
      input.expectedMineRevision,
      input.action as MineClientAction,
      input.townId,
    ));
  }));

  return router;
}
