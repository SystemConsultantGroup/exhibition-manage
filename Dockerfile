FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_KAKAO_REST_API_KEY
ENV NEXT_PUBLIC_KAKAO_REST_API_KEY=${NEXT_PUBLIC_KAKAO_REST_API_KEY}
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY next.config.mjs postcss.config.mjs tailwind.config.ts tsconfig.json next-env.d.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# The Kubernetes workload requires a non-root runtime user. The official
# Node Alpine image assigns its `node` user UID/GID 1000. Using numeric IDs
# makes that identity unambiguous to Kubernetes during admission.
RUN chown -R 1000:1000 /app
USER 1000:1000

EXPOSE 3000
CMD ["npm", "run", "start"]
