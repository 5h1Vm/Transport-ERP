FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json ./
# The schema must be present before npm install: the postinstall hook runs
# `prisma generate`, which fails the whole build if prisma/schema.prisma is not
# there yet. Copying it here also keeps the dependency layer cached across
# source-only changes.
COPY prisma ./prisma
RUN npm install
COPY . .
EXPOSE 4000
CMD ["npm", "start"]