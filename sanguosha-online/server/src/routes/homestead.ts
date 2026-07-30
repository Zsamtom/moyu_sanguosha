import { Router } from "express";
import { z } from "zod";
import {
  HOMESTEAD_CROP_FAMILY_IDS,
  HOMESTEAD_FEED_PROGRAM_IDS,
  HOMESTEAD_MINE_LAYER_IDS,
  HOMESTEAD_NPC_IDS,
  HOMESTEAD_NPC_TOPIC_IDS,
  HOMESTEAD_RESEARCH_NODE_IDS,
  HOMESTEAD_SEASON_MILESTONE_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type {
  FarmService,
  HomesteadClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const facilityIdSchema = z.enum([
  "mill",
  "feed_factory",
  "fertilizer_plant",
  "kitchen",
  "textile_mill",
  "smelter",
  "machine_shop",
]);

const recipeIdSchema = z.enum([
  "mill_flour",
  "mill_coarse_feed",
  "feed_fortified",
  "fertilizer_soil_conditioner",
  "textile_work_clothes",
  "smelt_iron_ingot",
  "workshop_mining_kit",
  "kitchen_festival_crate",
  "workshop_greenhouse_parts",
]);

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
]);

export const homesteadActionEnvelopeSchema = z.object({
  expectedFarmRevision: z.number().int().nonnegative(),
  expectedRanchRevision: z.number().int().nonnegative(),
  expectedMineRevision: z.number().int().nonnegative(),
  expectedHomesteadRevision: z.number().int().nonnegative(),
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
      input.action as HomesteadClientAction,
    ));
  }));

  return router;
}
