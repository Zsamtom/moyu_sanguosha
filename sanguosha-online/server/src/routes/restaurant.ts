import { Router } from "express";
import { z } from "zod";
import {
  ESTATE_TOWN_IDS,
  RESTAURANT_PROCESSING_IDS,
  RESTAURANT_RECIPE_IDS,
  RESTAURANT_SHOP_ITEM_IDS,
  RESTAURANT_TECHNIQUE_IDS,
} from "@sanguosha/shared";
import { asyncHandler } from "../errors.js";
import type {
  FarmService,
  RestaurantClientAction,
  RestaurantSupplyClientAction,
} from "../farm-service.js";
import { currentUser } from "../middleware/auth.js";

const townIdSchema = z.enum(ESTATE_TOWN_IDS);
const quantitySchema = z.number().int().min(1).max(99);

const restaurantActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("restaurant_buy_shop_item"),
    itemId: z.enum(RESTAURANT_SHOP_ITEM_IDS),
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_learn_technique"),
    techniqueId: z.enum(RESTAURANT_TECHNIQUE_IDS),
    sponsorTownId: townIdSchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_unlock_recipe"),
    recipeId: z.enum(RESTAURANT_RECIPE_IDS),
    sponsorTownId: townIdSchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_start_processing"),
    processingId: z.enum(RESTAURANT_PROCESSING_IDS),
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_collect_processing"),
    jobId: z.number().int().positive(),
  }).strict(),
  z.object({
    type: z.literal("restaurant_collect_supply"),
    shipmentId: z.string().trim().min(1).max(160),
  }).strict(),
  z.object({
    type: z.literal("restaurant_prepare_dish"),
    recipeId: z.enum(RESTAURANT_RECIPE_IDS),
    quantity: quantitySchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_set_menu"),
    recipeIds: z.array(z.enum(RESTAURANT_RECIPE_IDS)).max(6),
  }).strict(),
  z.object({
    type: z.literal("restaurant_open_service"),
    serviceTownId: townIdSchema,
  }).strict(),
  z.object({
    type: z.literal("restaurant_serve_order"),
    orderId: z.string().trim().min(1).max(160),
  }).strict(),
  z.object({ type: z.literal("restaurant_close_service") }).strict(),
]);

export const restaurantActionEnvelopeSchema = z.object({
  expectedAccountRevision: z.number().int().nonnegative(),
  expectedRestaurantRevision: z.number().int().nonnegative(),
  action: restaurantActionSchema,
}).strict();

const supplyActionSchema = z.object({
  type: z.literal("restaurant_supply_from_town"),
  sourceTownId: townIdSchema,
  lines: z.array(z.object({
    source: z.enum(["farm", "ranch", "goods"]),
    itemId: z.string().trim().min(1).max(80),
    quantity: quantitySchema,
  }).strict()).min(1).max(8),
}).strict();

export const restaurantSupplyEnvelopeSchema = z.object({
  expectedAccountRevision: z.number().int().nonnegative(),
  expectedRestaurantRevision: z.number().int().nonnegative(),
  expectedFarmRevision: z.number().int().nonnegative(),
  expectedRanchRevision: z.number().int().nonnegative(),
  expectedMineRevision: z.number().int().nonnegative(),
  expectedHomesteadRevision: z.number().int().nonnegative(),
  action: supplyActionSchema,
}).strict();

export function createRestaurantRouter(farm: FarmService): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await farm.getOrCreateRestaurant(currentUser(response)));
  }));

  router.post("/actions", asyncHandler(async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (request.body?.action?.type === "restaurant_supply_from_town") {
      const input = restaurantSupplyEnvelopeSchema.parse(request.body);
      response.json(await farm.supplyRestaurantFromTown(
        currentUser(response),
        input.expectedAccountRevision,
        input.expectedRestaurantRevision,
        input.expectedFarmRevision,
        input.expectedRanchRevision,
        input.expectedMineRevision,
        input.expectedHomesteadRevision,
        input.action as RestaurantSupplyClientAction,
      ));
      return;
    }

    const input = restaurantActionEnvelopeSchema.parse(request.body);
    response.json(await farm.applyRestaurantAction(
      currentUser(response),
      input.expectedAccountRevision,
      input.expectedRestaurantRevision,
      input.action as RestaurantClientAction,
    ));
  }));

  return router;
}
