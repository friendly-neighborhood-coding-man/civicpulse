/**
 * Provision a password account (operator action, never a public endpoint).
 *
 * Usage:
 *   npm run user:create -- --email ops@example.org --name "운영자" --role moderator
 *   npm run user:create -- --email a@example.org --name "시민" --password-stdin
 *
 * With no password source a strong temporary password is generated and printed
 * once. Deliberately no default credentials exist.
 */
import { createPasswordUser } from "../src/lib/domain/users.ts";
import { getDb } from "../src/lib/db/connection.ts";
import { generatePassword, checkPasswordPolicy } from "../src/lib/auth/password.ts";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const email = readArg("email");
  const name = readArg("name");
  const role = readArg("role") === "moderator" ? "moderator" : "citizen";
  if (!email || !name) {
    console.error(
      "Usage: npm run user:create -- --email <email> --name <display name> [--role moderator] [--password-stdin]",
    );
    process.exitCode = 2;
    return;
  }

  const generated = !process.argv.includes("--password-stdin");
  const password = generated ? generatePassword() : await readStdin();
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    console.error(policy.message);
    process.exitCode = 2;
    return;
  }

  const db = getDb();
  const user = createPasswordUser(db, {
    email,
    password,
    displayName: name,
    role,
  });

  console.log(
    JSON.stringify(
      {
        user,
        password: generated ? password : "(read from stdin, not shown)",
        note: generated
          ? "Store this password now; it is printed once and cannot be recovered."
          : "Password was supplied on stdin and is not logged.",
        authModeHint: "Set CIVICPULSE_AUTH_MODE=password to enable password login.",
      },
      null,
      2,
    ),
  );
}

void main();
