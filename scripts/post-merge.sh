#!/bin/bash
set -e
# Install workspace deps using filtered installs to avoid timeout
pnpm install --filter @workspace/api-server --prefer-offline
pnpm install --filter @workspace/db --filter @workspace/api-zod --filter @workspace/api-spec --filter @workspace/api-client-react --prefer-offline
pnpm install --filter @workspace/mockup-sandbox --prefer-offline
pnpm install --filter @workspace/mobile --prefer-offline
