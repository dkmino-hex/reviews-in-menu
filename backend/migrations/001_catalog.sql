CREATE TABLE category (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);
CREATE TABLE dish (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id bigint NOT NULL REFERENCES category(id),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    description text NOT NULL,
    ingredients text NOT NULL,
    price numeric(10,2) NOT NULL CHECK (price >= 0),
    portion_value numeric(8,2) CHECK (portion_value > 0),
    portion_unit text CHECK (portion_unit IN ('g','ml')),
    image_key text,
    CHECK ((portion_value IS NULL) = (portion_unit IS NULL))
);
CREATE INDEX dish_category_idx ON dish(category_id,id);
CREATE TABLE dish_alias (
    dish_id bigint NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
    alias text NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 120),
    PRIMARY KEY (dish_id,alias)
);
