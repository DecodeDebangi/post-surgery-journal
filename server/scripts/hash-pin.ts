// Prompts for a 6-digit PIN and prints its bcrypt hash for .env.
// Usage: npm run hash-pin
// The PIN is typed at a prompt, so it never lands in your shell history.
import { createInterface } from "node:readline/promises";
import bcrypt from "bcrypt";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pin = (await rl.question("6-digit PIN: ")).trim();
rl.close();

if (!/^\d{6}$/.test(pin)) {
  console.error("The PIN must be exactly 6 digits.");
  process.exit(1);
}
const hash = await bcrypt.hash(pin, 12);
console.log(`\nPaste into .env (keep the single quotes):\n'${hash}'`);
