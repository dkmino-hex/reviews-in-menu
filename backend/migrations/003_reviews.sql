CREATE TABLE review (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dish_id bigint NOT NULL REFERENCES dish(id),
    author_id bigint NOT NULL REFERENCES app_user(id),
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body text NOT NULL DEFAULT '',
    publication_state text NOT NULL DEFAULT 'published'
        CHECK (publication_state IN ('published', 'hidden')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX review_current_dish_author_idx
    ON review (dish_id, author_id)
    WHERE publication_state IN ('published', 'hidden');