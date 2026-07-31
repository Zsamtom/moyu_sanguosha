import { Router } from "express";
import { z } from "zod";
import {
  ALL_FARMING_CROP_IDS,
  ESTATE_TOWN_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type {
  FarmClientAction,
  FarmService,
  FarmVisitClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const cropIdSchema = z.enum(ALL_FARMING_CROP_IDS);
const townIdSchema = z.enum(ESTATE_TOWN_IDS);
const quantitySchema = z.number().int().min(1).max(99);
const plotIndexSchema = z.number().int().min(0).max(11);
const plotIndicesSchema = z.array(plotIndexSchema)
  .min(2)
  .max(12)
  .refine(
    (indices) => new Set(indices).size === indices.length,
    "田块编号不能重复",
  );
const careSchema = z.enum(["water", "weed", "pest"]);

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("farming_buy_seed"),
    cropId: cropIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("farming_plant"),
    cropId: cropIdSchema,
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_batch_plant"),
    cropId: cropIdSchema,
    plotIndices: plotIndicesSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_tend"),
    care: careSchema,
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_harvest"),
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_batch_harvest"),
    plotIndices: plotIndicesSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_clear_plot"),
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_sell"),
    cropId: cropIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("farming_redeem_mutation"),
    cropId: cropIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({ type: z.literal("farming_expand_plot") }).strict(),
  z.object({ type: z.literal("farming_upgrade_dog") }).strict(),
]);

const visitActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("farming_help"),
    care: careSchema,
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_steal"),
    plotIndex: plotIndexSchema,
  }).strict(),
]);

export const farmActionEnvelopeSchema = z.object({
  townId: townIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export const farmVisitEnvelopeSchema = z.object({
  townId: townIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  expectedNeighborRevision: z.number().int().nonnegative(),
  action: visitActionSchema,
}).strict();

const userIdSchema = z.string().uuid();

export function createFarmRouter(farm: FarmService): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.getOrCreate(currentUser(response)));
  }));

  router.post("/actions", asyncHandler(async (request, response) => {
    const input = farmActionEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyAction(
      currentUser(response),
      input.expectedRevision,
      input.action as FarmClientAction,
      input.townId,
    ));
  }));

  router.get("/neighbors", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ neighbors: await farm.getNeighbors(currentUser(response)) });
  }));

  router.get("/neighbors/:userId", asyncHandler(async (request, response) => {
    const neighborId = userIdSchema.parse(request.params.userId);
    response.set("Cache-Control", "no-store");
    response.json({
      farm: await farm.getNeighbor(currentUser(response), neighborId),
    });
  }));

  router.post("/neighbors/:userId/actions", asyncHandler(async (request, response) => {
    const neighborId = userIdSchema.parse(request.params.userId);
    const input = farmVisitEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyVisitAction(
      currentUser(response),
      neighborId,
      input.expectedRevision,
      input.expectedNeighborRevision,
      input.action as FarmVisitClientAction,
      input.townId,
    ));
  }));

  return router;
}
