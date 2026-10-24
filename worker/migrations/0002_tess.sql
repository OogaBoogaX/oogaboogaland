-- Tess's answers (#270): questions the page could not answer by itself, with what she said, kept without identity: no
-- address, login or user agent. A row is pruned 90 days after its question was last asked.

CREATE TABLE tess_answers (
  version    TEXT    NOT NULL,                -- the prompt and model she answered under; a deploy that changes them retires the row
  question   TEXT    NOT NULL,                -- folded: lower case, no accents or punctuation
  about      TEXT    NOT NULL,                -- the place the visitor was last asking about, '' for none
  say        TEXT    NOT NULL,                -- her answer, a line a speech bubble
  go         TEXT,                            -- the place she flew them to, or NULL
  asked      INTEGER NOT NULL,                -- how many times
  first_day  TEXT    NOT NULL,                -- YYYY-MM-DD, UTC
  last_day   TEXT    NOT NULL,
  PRIMARY KEY (version, question, about)
);
CREATE INDEX tess_answers_last ON tess_answers(last_day);

-- What her answers cost each day, from each answer's token usage, against the daily cap.
CREATE TABLE tess_spend (
  day        TEXT    PRIMARY KEY,             -- YYYY-MM-DD, UTC
  micro_usd  INTEGER NOT NULL,                -- millionths of a dollar
  calls      INTEGER NOT NULL
);
