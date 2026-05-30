import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const getRating = query({
  args: {
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
  },
  handler: async (ctx, { userId, tmdbId, type }) => {
    return ctx.db
      .query("ratings")
      .withIndex("by_user_tmdb_type", (q) =>
        q.eq("userId", userId).eq("tmdbId", tmdbId).eq("type", type)
      )
      .unique();
  },
});

export const setRating = mutation({
  args: {
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    liked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ratings")
      .withIndex("by_user_tmdb_type", (q) =>
        q.eq("userId", args.userId).eq("tmdbId", args.tmdbId).eq("type", args.type)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { liked: args.liked });
      return existing._id;
    }
    return ctx.db.insert("ratings", args);
  },
});

export const removeRating = mutation({
  args: {
    userId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
  },
  handler: async (ctx, { userId, tmdbId, type }) => {
    const item = await ctx.db
      .query("ratings")
      .withIndex("by_user_tmdb_type", (q) =>
        q.eq("userId", userId).eq("tmdbId", tmdbId).eq("type", type)
      )
      .unique();
    if (item) await ctx.db.delete(item._id);
  },
});

export const countAll = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("ratings").collect();
    return all.length;
  },
});
