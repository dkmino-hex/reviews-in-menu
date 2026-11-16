ALTER TABLE review DROP CONSTRAINT review_publication_state_check;
ALTER TABLE review
    ADD COLUMN version integer NOT NULL DEFAULT 1,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN moderation_reason text,
    ADD CONSTRAINT review_publication_state_check
        CHECK (publication_state IN ('published', 'hidden', 'archived', 'deleted', 'removed')),
    ADD CONSTRAINT review_archived_at_check
        CHECK ((publication_state = 'archived') = (archived_at IS NOT NULL));

DROP INDEX review_current_dish_author_idx;
CREATE UNIQUE INDEX review_current_dish_author_idx ON review (dish_id, author_id)
    WHERE publication_state IN ('published', 'hidden', 'removed');
CREATE INDEX review_archive_idx ON review (archived_at) WHERE publication_state = 'archived';
