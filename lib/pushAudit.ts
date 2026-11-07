import type { Session } from "./auth";
import { withAuditEntry } from "./actions";
import { actorName } from "./session";
import { updateDB } from "./store";

/** Record a notification-related admin action in the edit history. Never fails the request. */
export async function auditPush(session: Session, action: string, detail: string) {
  try {
    await updateDB((db) => withAuditEntry(db, actorName(session), action, detail));
  } catch (e) {
    console.error("could not record in history", e);
  }
}
