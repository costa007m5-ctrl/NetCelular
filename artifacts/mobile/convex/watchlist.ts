import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const getAll = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    return ctx.db
      .query("watchlist")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .collect();
  },
});

export const isAdded = query({
  args: { deviceId: v.string(), tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (ctx, { deviceId, tmdbId, type }) => {
    const item = await ctx.db
      .query("watchlist")
      .withIndex("by_device_tmdb_type", (q) =>
        q.eq("deviceId", deviceId).eq("tmdbId", tmdbId).eq("type", type)
      )
      .unique();
    return !!item;
  },
});

export const add = mutation({
  args: {
    deviceId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.string(),
    backdropPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_device_tmdb_type", (q) =>
        q.eq("deviceId", args.deviceId).eq("tmdbId", args.tmdbId).eq("type", args.type)
      )
      .unique();

    if (existing) return existing._id;
    return ctx.db.insert("watchlist", args);
  },
});

export const remove = mutation({
  args: {
    deviceId: v.string(),
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
  },
  handler: async (ctx, { deviceId, tmdbId, type }) => {
    const item = await ctx.db
      .query("watchlist")
      .withIndex("by_device_tmdb_type", (q) =>
        q.eq("deviceId", deviceId).eq("tmdbId", tmdbId).eq("type", type)
      )
      .unique();
    if (item) await ctx.db.delete(item._id);
  },
});
