CREATE TABLE rooms (
 code TEXT PRIMARY KEY NOT NULL,
 host_hash TEXT NOT NULL,
 guest_hash TEXT,
 creator TEXT NOT NULL,
 created INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 revision INTEGER NOT NULL,
 payload BLOB NOT NULL
);
--> statement-breakpoint
CREATE INDEX rooms_expiry ON rooms(expires);
--> statement-breakpoint
CREATE INDEX rooms_creator ON rooms(creator,created);
