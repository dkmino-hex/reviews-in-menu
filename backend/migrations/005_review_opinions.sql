CREATE TABLE review_opinion (
    review_id bigint NOT NULL REFERENCES review(id) ON DELETE CASCADE,
    source_body text NOT NULL CHECK (source_body <> ''),
    label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
    tone text NOT NULL CHECK (tone IN ('positive', 'negative', 'neutral')),
    PRIMARY KEY (review_id, label)
);

CREATE VIEW published_review_opinion AS
SELECT r.id AS review_id,r.dish_id,r.created_at,o.label,o.tone
FROM review_opinion o JOIN review r ON r.id=o.review_id
WHERE r.publication_state='published' AND r.body=o.source_body;

CREATE VIEW published_review_sentiment AS
SELECT review_id,dish_id,created_at,
    CASE
        WHEN bool_or(tone='positive') AND bool_or(tone='negative') THEN 'mixed'
        WHEN bool_or(tone='positive') THEN 'positive'
        WHEN bool_or(tone='negative') THEN 'negative'
        ELSE 'neutral'
    END AS tone
FROM published_review_opinion GROUP BY review_id,dish_id,created_at;
