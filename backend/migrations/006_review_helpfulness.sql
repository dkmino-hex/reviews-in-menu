CREATE TABLE review_vote (
    review_id bigint NOT NULL REFERENCES review(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    vote smallint NOT NULL CHECK (vote IN (-1, 1)),
    PRIMARY KEY (review_id, user_id)
);

CREATE VIEW review_vote_totals AS
SELECT review_id,
       count(*) FILTER (WHERE vote = 1) AS helpful,
       count(*) FILTER (WHERE vote = -1) AS unhelpful
FROM review_vote GROUP BY review_id;
