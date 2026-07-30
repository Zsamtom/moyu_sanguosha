import { Router } from "express";
import { z } from "zod";
import {
  HOMESTEAD_CROP_FAMILY_IDS,
  HOMESTEAD_FACILITY_IDS,
  HOMESTEAD_FEED_PROGRAM_IDS,
  HOMESTEAD_MINE_LAYER_IDS,
  HOMESTEAD_NPC_IDS,
  HOMESTEAD_NPC_TOPIC_IDS,
  HOMESTEAD_RESEARCH_NODE_IDS,
  HOMESTEAD_RECIPE_IDS,
  HOMESTEAD_RESILIENCE_IDS,
  HOMESTEAD_SEASON_MILESTONE_IDS,
  HOMESTEAD_VALUE_ROUTE_IDS,
  ESTATE_MERCHANT_ITEM_IDS,
  ESTATE_TOWN_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type {
  FarmService,
  HomesteadClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const facilityIdSchema = z.enum(HOMESTEAD_FACILITY_IDS);
const recipeIdSchema = z.enum(HOMESTEAD_RECIPE_IDS);

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("homestead_build_facility"),
    facilityId: facilityIdSchema,
  }).strict(),
  z.object({
    type: z.literal("homestead_start_job"),
    recipeId: recipeIdSchema,
  }).strict(),
  z.object({
    type: z.literal("homestead_collect_job"),
    facilityId: facilityIdSchema,
  }).strict(),
  z.object({
    type: z.literal("homestead_complete_order"),
    orderId: z.string().min(1).max(160),
  }).strict(),
  z.object({
    type: z.literal("homestead_choose_event"),
    optionId: z.string().min(1).max(80),
  }).strict(),
  z.object({
    type: z.literal("homestead_unlock_research"),
    nodeId: z.enum(HOMESTEAD_RESEARCH_NODE_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_upgrade_facility"),
    facilityId: facilityIdSchema,
  }).strict(),
  z.object({
    type: z.literal("homestead_plan_rotation"),
    cropFamily: z.enum(HOMESTEAD_CROP_FAMILY_IDS),
    useFertilizer: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("homestead_run_feed_program"),
    programId: z.enum(HOMESTEAD_FEED_PROGRAM_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_upgrade_mine_protection"),
  }).strict(),
  z.object({
    type: z.literal("homestead_survey_layer"),
    layerId: z.enum(HOMESTEAD_MINE_LAYER_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_talk_npc"),
    npcId: z.enum(HOMESTEAD_NPC_IDS),
    topicId: z.enum(HOMESTEAD_NPC_TOPIC_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_claim_season_reward"),
    milestoneId: z.enum(HOMESTEAD_SEASON_MILESTONE_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_upgrade_resilience"),
    resilienceId: z.enum(HOMESTEAD_RESILIENCE_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_activate_emergency_boost"),
    sectorId: z.enum(["farm", "ranch", "mine"]),
  }).strict(),
  z.object({
    type: z.literal("homestead_unlock_town"),
    townId: z.enum(ESTATE_TOWN_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_switch_town"),
    townId: z.enum(ESTATE_TOWN_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_buy_merchant_item"),
    itemId: z.enum(ESTATE_MERCHANT_ITEM_IDS),
  }).strict(),
  z.object({
    type: z.literal("homestead_use_acceleration_card"),
    facilityId: facilityIdSchema,
  }).strict(),
  z.object({
    type: z.literal("homestead_start_town_sector"),
    sectorId: z.enum(["farm", "ranch", "mine"]),
  }).strict(),
  z.object({
    type: z.literal("homestead_collect_town_sector"),
    sectorId: z.enum(["farm", "ranch", "mine"]),
  }).strict(),
  z.object({
    type: z.literal("homestead_upgrade_town_sector"),
    sectorId: z.enum(["farm", "ranch", "mine"]),
  }).strict(),
  z.object({
    type: z.literal("homestead_sell_town_resource"),
    resourceId: z.enum(["snow_potato", "yak_milk", "frost_crystal"]),
    quantity: z.number().int().min(1).max(999),
  }).strict(),
  z.object({
    type: z.literal("homestead_resolve_town_problem"),
    problemId: z.string().min(1).max(80),
  }).strict(),
  z.object({
    type: z.literal("homestead_restore_town_landmark"),
  }).strict(),
  z.object({
    type: z.literal("homestead_complete_value_route"),
    routeId: z.enum(HOMESTEAD_VALUE_ROUTE_IDS),
  }).strict(),
]);

export const homesteadActionEnvelopeSchema = z.object({
  expectedFarmRevision: z.number().int().nonnegative(),
  expectedRanchRevision: z.number().int().nonnegative(),
  expectedMineRevision: z.number().int().nonnegative(),
  expectedHomesteadRevision: z.number().int().nonnegative(),
  expectedAccountRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export function createHomesteadRouter(farm: FarmService): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.getOrCreateHomestead(currentUser(response)));
  }));

  router.post("/actions", asyncHandler(async (request, response) => {
    const input = homesteadActionEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyHomesteadAction(
      currentUser(response),
      input.expectedFarmRevision,
      input.expectedRanchRevision,
      input.expectedMineRevision,
      input.expectedHomesteadRevision,
      input.expectedAccountRevision,
      input.action as HomesteadClientAction,
    ));
  }));

  return router;
}
