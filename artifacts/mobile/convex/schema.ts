import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  watchlist: defineTable({
    deviceId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_tmdb_type", ["deviceId", "tmdbId", "type"]),

  watchProgress: defineTable({
    deviceId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
    progress: v.number(),
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_tmdb_type", ["deviceId", "tmdbId", "type"]),
});
