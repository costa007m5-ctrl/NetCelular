import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    avatarLetter: v.optional(v.string()),
  }).index("by_email", ["email"]),

  watchlist: defineTable({
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_tmdb_type", ["userId", "tmdbId", "type"]),

  watchProgress: defineTable({
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
    progress: v.number(),
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_tmdb_type", ["userId", "tmdbId", "type"]),

  ratings: defineTable({
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    liked: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_tmdb_type", ["userId", "tmdbId", "type"]),
});
