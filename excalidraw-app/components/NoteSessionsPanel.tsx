import { Button } from "@excalidraw/excalidraw/components/Button";
import {
  DuplicateIcon,
  PlusIcon,
  TrashIcon,
  pencilIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";

import "./NoteSessionsPanel.scss";

import type { NoteSessionMeta } from "../data/noteSessions";

const relativeTime = (timestamp: number) => {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
};

type NoteSessionRowProps = {
  session: NoteSessionMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

const NoteSessionRow = ({
  session,
  isActive,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
}: NoteSessionRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setDraftName(session.name);
    setIsEditing(true);
  };

  const commitRename = () => {
    setIsEditing(false);
    if (draftName.trim() && draftName !== session.name) {
      onRename(session.id, draftName);
    }
  };

  return (
    <li
      className={`note-sessions-panel__item ${
        isActive ? "note-sessions-panel__item--active" : ""
      }`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="note-sessions-panel__rename-input"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitRename();
            } else if (event.key === "Escape") {
              setIsEditing(false);
            }
            // don't let the editor's global shortcut handler see these keys
            event.stopPropagation();
          }}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="note-sessions-panel__open"
          onClick={() => onSelect(session.id)}
          onDoubleClick={startEditing}
          title={session.name}
        >
          <span className="note-sessions-panel__name">{session.name}</span>
          <span className="note-sessions-panel__meta">
            {relativeTime(session.updatedAt)}
          </span>
        </button>
      )}

      <div className="note-sessions-panel__actions">
        <button
          type="button"
          aria-label={`Rename ${session.name}`}
          title="Rename"
          onClick={startEditing}
        >
          {pencilIcon}
        </button>
        <button
          type="button"
          aria-label={`Duplicate ${session.name}`}
          title="Duplicate"
          onClick={() => onDuplicate(session.id)}
        >
          {DuplicateIcon}
        </button>
        <button
          type="button"
          aria-label={`Delete ${session.name}`}
          title="Delete"
          onClick={() => onDelete(session.id)}
        >
          {TrashIcon}
        </button>
      </div>
    </li>
  );
};

export type NoteSessionsPanelProps = {
  sessions: NoteSessionMeta[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export const NoteSessionsPanel = ({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: NoteSessionsPanelProps) => {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSessions = normalizedQuery
    ? sessions.filter((session) =>
        session.name.toLowerCase().includes(normalizedQuery),
      )
    : sessions;

  const handleDelete = useCallback(
    (id: string) => {
      const session = sessions.find((session) => session.id === id);
      if (
        session &&
        window.confirm(
          `Delete "${session.name}"? This permanently removes the note session from this browser.`,
        )
      ) {
        onDelete(id);
      }
    },
    [sessions, onDelete],
  );

  return (
    <div className="note-sessions-panel">
      <Button
        className="note-sessions-panel__new"
        onSelect={onCreate}
        title="New note session"
      >
        {PlusIcon}
        <span>New note session</span>
      </Button>

      {sessions.length > 5 && (
        <input
          className="note-sessions-panel__search"
          type="search"
          placeholder="Search notes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      )}

      {visibleSessions.length === 0 ? (
        <p className="note-sessions-panel__empty">
          {normalizedQuery
            ? "No note sessions match your search."
            : "No note sessions yet."}
        </p>
      ) : (
        <ul className="note-sessions-panel__list">
          {visibleSessions.map((session) => (
            <NoteSessionRow
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      <p className="note-sessions-panel__footnote">
        Note sessions are stored in this browser only.
      </p>
    </div>
  );
};
