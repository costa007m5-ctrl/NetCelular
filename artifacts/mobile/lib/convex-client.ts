import { ConvexReactClient } from "convex/react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

export const convexClient = url ? new ConvexReactClient(url) : null;

export const isConvexConfigured = Boolean(url);
