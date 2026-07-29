import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../errors.js";
import type { FarmClientAction, FarmService } from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const cropIdSchema = z.enum(["wheat", "tomato", "pumpkin"]);
const quantitySchema = z.number().int().min(1).max(20);
const plotIndexSchema = z.number().int().min(0).max(5);
const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("farm_buy_seed"),
    cropId: cropIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("farm_plant"),
    cropId: cropIdSchema,
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({ type: z.literal("farm_water") }).strict(),
  z.object({
    type: z.literal("farm_harvest"),
    plotIndex: plotIndexSchema,
  }).strict(),
  z.object({
    type: z.literal("farm_sell"),
    cropId: cropIdSchema,
    quantity: quantitySchema,
  }).strict(),
  z.object({ type: z.literal("farm_end_turn") }).strict(),
]);
export const farmActionEnvelopeSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  action: actionSchema,
}).strict();

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

  router.post("/reset", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.reset(currentUser(response)));
  }));

  return router;
}
