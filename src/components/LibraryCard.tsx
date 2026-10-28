import { useState } from "react";
import { LibraryError, fetchLibrary, type LibraryFile, type LibraryUpdate } from "../library";

const list = (names: string[]) => names.map((n) => `“${n}”`).join(", ");

function summary(r: LibraryUpdate): string {
  const parts: string[] = [];
  if (r.added.length) parts.push(`Added ${r.added.length === 1 ? "1 new ride" : `${r.added.length} new rides`}: ${list(r.added)}.`);
  if (r.updated.length) parts.push(`Updated ${list(r.updated)}.`);
  if (r.keptEdited.length) parts.push(`Left your edited ${r.keptEdited.length === 1 ? "copy" : "copies"} of ${list(r.keptEdited)} as is.`);
  if (!parts.length) parts.push("No new rides right now. You have the latest.");
  if (r.errors.length) parts.push(`Couldn't read: ${r.errors.join("; ")}`);
  return parts.join(" ");
}

/** Download the newest rides from the public ride library; no account or token needed. */
export function LibraryCard({ onUpdate }: { onUpdate: (files: LibraryFile[]) => LibraryUpdate }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const getLatest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: summary(onUpdate(await fetchLibrary())) });
    } catch (err) {
      setMessage({ text: err instanceof LibraryError ? err.message : `Something went wrong: ${String(err)}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card files library">
      <div>
        <strong>Ride Library</strong>
        <p className="muted">New rides are added to the library from time to time. Your own workouts and any rides you've edited are never changed.</p>
        {message && <p className={message.error ? "sync-error" : "library-result"}>{message.text}</p>}
      </div>
      <div className="files-actions">
        <button type="button" onClick={getLatest} disabled={busy}>
          {busy ? "Checking…" : "⬇ Check for new rides"}
        </button>
      </div>
    </section>
  );
}
