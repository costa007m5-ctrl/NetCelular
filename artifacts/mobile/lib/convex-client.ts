import { ConvexReactClient } from "convex/react";

const rawUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const url = rawUrl ? rawUrl.replace(/\/+$/, "") : undefined;

export const convexClient = url ? new ConvexReactClient(url) : null;

export const isConvexConfigured = Boolean(url);
