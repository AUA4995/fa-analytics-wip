/**
 * Emergency owner recovery (Batch 2 item 33):
 *
 *   npm run owner:recover
 *
 * Run it on a machine that has this repo and the Hub's .env (DATABASE_URL, FRONT_API_TOKEN). It ONLY emails the
 * owner one link (via Front, from the digest send channel) to set a new password and set up two-step sign-in again.
 * It never sets a password, never prints a link or token, and changes nothing if Front can't send.
 */
import "dotenv/config";
import { sendOwnerRecovery } from "../src/lib/auth/flows";
import { prisma } from "../src/lib/db";

async function main() {
  const r = await sendOwnerRecovery();
  if (r.sent) {
    console.log(`Recovery email sent to ${r.to}. The link works once, for 2 hours. Nothing else was changed.`);
    return 0;
  }
  console.log(r.message);
  return 1;
}

main()
  .then((code) => (process.exitCode = code))
  .catch((err) => {
    console.error(`Owner recovery stopped: ${err instanceof Error ? err.message : String(err)} — nothing was sent.`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
