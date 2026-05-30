import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

export const register = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, { email, name, passwordHash }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase().trim()))
      .unique();
    if (existing) return { error: "Email já cadastrado" };

    const all = await ctx.db.query("users").collect();
    const role = all.length === 0 ? "admin" : ("user" as const);

    const id = await ctx.db.insert("users", {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      role,
      avatarLetter: name.trim()[0]?.toUpperCase() ?? "U",
    });

    const user = await ctx.db.get(id);
    if (!user) return { error: "Erro ao criar usuário" };
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarLetter: user.avatarLetter ?? "U",
    };
  },
});

export const login = mutation({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, { email, passwordHash }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase().trim()))
      .unique();
    if (!user) return { error: "Email não encontrado" };
    if (user.passwordHash !== passwordHash) return { error: "Senha incorreta" };
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarLetter: user.avatarLetter ?? user.name[0]?.toUpperCase() ?? "U",
    };
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await ctx.db.get(id as any);
    if (!user) return null;
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarLetter: user.avatarLetter ?? user.name[0]?.toUpperCase() ?? "U",
    };
  },
});

export const countAll = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    return all.length;
  },
});
