import { Router } from "express";
import { z } from "zod";
import {
  ALL_RANCH_ANIMAL_IDS,
  ALL_RANCH_PRODUCT_IDS,
  ESTATE_TOWN_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type {
  FarmService,
  RanchClientAction,
  RanchVisitClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const animalIdSchema = z.enum(ALL_RANCH_ANIMAL_IDS);
const productIdSchema = z.enum(ALL_RANCH_PRODUCT_IDS);
const townIdSchema = z.enum(ESTATE_TOWN_IDS);
const quantitySchema = z.number().int().min(1).max(99);
const penIndexSchema = z.number().int().min(0).max(7);

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ranch_buy_animal"),
    animalId: animalIdSchema,
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_feed"),
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_move_animal"),
    fromPenIndex: penIndexSchema,
    toPenIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_sell_animal"),
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_clean"),
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_collect"),
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_sell"),
    productId: productIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({ type: z.literal("ranch_expand_pen") }).strict(),
]);

const visitActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ranch_help"),
    penIndex: penIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("ranch_neighbor_collect"),
    penIndex: penIndexSchema,
  }).strict(),
]);

export const ranchActionEnvelopeSchema = z.object({
  townId: townIdSchema,
  expectedFarmRevision: z.number().int().nonnegative(),
  expectedRanchRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export const ranchVisitEnvelopeSchema = z.object({
  townId: townIdSchema,
  expectedRanchRevision: z.number().int().nonnegative(),
  expectedNeighborRevision: z.number().int().nonnegative(),
  action: visitActionSchema,
}).strict();

const userIdSchema = z.string().uuid();

export function createRanchRouter(farm: FarmService): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.getOrCreateRanch(currentUser(response)));
  }));

  router.post("/actions", asyncHandler(async (request, response) => {
    const input = ranchActionEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyRanchAction(
      currentUser(response),
      input.expectedFarmRevision,
      input.expectedRanchRevision,
      input.action as RanchClientAction,
      input.townId,
    ));
  }));

  router.get("/neighbors", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({
      neighbors: await farm.getRanchNeighbors(currentUser(response)),
    });
  }));

  router.get("/neighbors/:userId", asyncHandler(async (request, response) => {
    const neighborId = userIdSchema.parse(request.params.userId);
    response.set("Cache-Control", "no-store");
    response.json({
      ranch: await farm.getRanchNeighbor(currentUser(response), neighborId),
    });
  }));

  router.post("/neighbors/:userId/actions", asyncHandler(async (request, response) => {
    const neighborId = userIdSchema.parse(request.params.userId);
    const input = ranchVisitEnvelopeSchema.parse(request.body);
    response.set("Cache-Control", "no-store");
    response.json(await farm.applyRanchVisitAction(
      currentUser(response),
      neighborId,
      input.expectedRanchRevision,
      input.expectedNeighborRevision,
      input.action as RanchVisitClientAction,
      input.townId,
    ));
  }));

  return router;
}
