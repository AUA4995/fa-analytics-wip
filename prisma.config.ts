import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL may be missing during `npm install` (postinstall runs `prisma generate`,
// which does not connect). Migrate/seed commands still need the real value from .env.
const url = process.env.DATABASE_URL ?? "postgresql://not-set@localhost:5432/set-DATABASE_URL-in-.env";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
