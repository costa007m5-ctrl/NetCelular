import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const getAll = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("watchProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const upsert = mutation({
  args: {
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
    progress: v.number(),
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchProgress")
      .withIndex("by_user_tmdb_type", (q) =>
        q.eq("userId", args.userId).eq("tmdbId", args.tmdbId).eq("type", args.type)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        progress: args.progress,
        season: args.season,
        episode: args.episode,
        posterPath: args.posterPath,
        backdropPath: args.backdropPath,
      });
      return existing._id;
    }
    return ctx.db.insert("watchProgress", args);
  },
});
