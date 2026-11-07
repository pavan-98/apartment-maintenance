import type { DB } from "./types";
import { readClaims, resolveSession, type Session } from "./auth";
import { loadDB } from "./store";
import { managerView, ownerView, publicView } from "./actions";

/** Load the database and the logged-in admin (if any). */
export async function getSession(): Promise<{ db: DB; session: Session | null }> {
  const [db, claims] = await Promise.all([loadDB(), readClaims()]);
  return { db, session: resolveSession(claims, db) };
}

/** How an admin is named in the edit history. */
export function actorName(session: Session): string {
  return session.role === "manager" ? `${session.name} (manager)` : session.name;
}

/** The slice of data each kind of visitor is allowed to receive. */
export function viewFor(db: DB, session: Session | null): DB {
  if (!session) return publicView(db);
  return session.role === "owner" ? ownerView(db) : managerView(db);
}
