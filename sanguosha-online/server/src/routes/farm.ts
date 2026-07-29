import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../errors.js";
import type {
  FarmClientAction,
  FarmService,
  FarmVisitClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const cropIdSchema = z.enum([
  "wheat",
  "carrot",
  "tomato",
  "corn",
  "pumpkin",
  "strawberry",
  "sunflower",
  "watermelon",
  "grape",
  "blueberry",
  "cotton",
  "dragonfruit",
]);
const quantitySchema = z.number().int().min(1).max(99);
const plotIndexSchema = z.number().int().min(0).max(11);
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
    type: z.literal("farming_tend"),
    care: careSchema,
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farming_harvest"),
    plotIndex: plotIndexSchema,
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
  expectedRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

export const farmVisitEnvelopeSchema = z.object({
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
    ));
  }));

  return router;
}
