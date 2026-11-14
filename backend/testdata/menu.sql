BEGIN;
INSERT INTO category(name) VALUES ('Горячее'),('Напитки') ON CONFLICT DO NOTHING;
INSERT INTO dish(category_id,name,description,ingredients,price,portion_value,portion_unit)
SELECT c.id,v.name,v.description,v.ingredients,v.price,v.amount,v.unit
FROM (VALUES
    ('Горячее','Паста с томатами','Паста в томатном соусе','Паста, томаты, базилик',420,280,'g'),
    ('Горячее','Овощной суп','Горячий овощной суп','Картофель, морковь, зелень',260,300,'ml'),
    ('Напитки','Чай с мятой','Листовой чай с мятой','Чёрный чай, мята',150,250,'ml')
) AS v(category,name,description,ingredients,price,amount,unit)
JOIN category c ON c.name=v.category
WHERE NOT EXISTS (SELECT 1 FROM dish d WHERE d.category_id=c.id AND d.name=v.name);
COMMIT;
