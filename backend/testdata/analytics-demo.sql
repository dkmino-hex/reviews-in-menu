BEGIN;

INSERT INTO category(name) VALUES ('Салаты'), ('Десерты') ON CONFLICT DO NOTHING;

INSERT INTO dish(category_id,name,description,ingredients,price,portion_value,portion_unit)
SELECT c.id, v.name, v.description, v.ingredients, v.price, v.amount, 'g'
FROM (VALUES
    ('Горячее', 'Домашние котлеты', 'Домашние котлеты с подрумяненной корочкой', 'Курица, говядина, лук, сухари', 390, 220),
    ('Салаты', 'Греческий салат', 'Свежие овощи, фета и оливки', 'Томаты, огурцы, красный лук, фета, оливки', 350, 230),
    ('Десерты', 'Сырники со сметаной', 'Тёплые творожные сырники со сметаной', 'Творог, яйцо, мука, сахар, сметана', 290, 180)
) AS v(category_name,name,description,ingredients,price,amount)
JOIN category c ON c.name=v.category_name
WHERE NOT EXISTS (SELECT 1 FROM dish d WHERE d.category_id=c.id AND d.name=v.name);

CREATE TEMP TABLE demo_dishes ON COMMIT DROP AS
SELECT DISTINCT ON (v.tag) v.*, d.id AS dish_id
FROM (VALUES
    ('A','Горячее','Паста с томатами','Соус получился насыщенным, паста упругая.','Томатного соуса хотелось бы побольше.'),
    ('B','Горячее','Овощной суп','Лёгкий суп, овощи сохранили вкус.','Суп хотелось бы получить погорячее.'),
    ('C','Напитки','Чай с мятой','Яркий аромат мяты, чай мягкий.','Мята почти не чувствовалась.'),
    ('D','Горячее','Домашние котлеты','Котлеты сочные и вкусные.','Корочка оказалась суховатой.'),
    ('E','Салаты','Греческий салат','Овощи хрустящие, феты много.','Заправка показалась слишком кислой.'),
    ('F','Десерты','Сырники со сметаной','Сырники нежные, сметана хорошо подходит.','Хотелось чуть меньше сахара.')
) AS v(tag,category_name,dish_name,praise,critique)
JOIN category c ON c.name=v.category_name
JOIN dish d ON d.category_id=c.id AND d.name=v.dish_name
ORDER BY v.tag,d.id;

UPDATE dish d SET image_key=rpad('DEMOMENUPHOTO',25,'A') || demo.tag || '.jpeg'
FROM demo_dishes demo WHERE d.id=demo.dish_id AND d.image_key IS NULL;

INSERT INTO app_user(login,display_name,password_hash,role,blocked)
SELECT 'vkr_demo_review_' || n, 'Учебный посетитель ' || n, decode(repeat('00',48),'hex'), 'visitor', true
FROM generate_series(1,12) n
ON CONFLICT (login) DO NOTHING;

INSERT INTO review(dish_id,author_id,rating,body,publication_state,created_at,moderation_reason)
SELECT d.dish_id, u.id, sample.rating,
       CASE WHEN n IN (4,7,10) THEN '' WHEN sample.rating >= 4 THEN d.praise ELSE d.critique END,
       CASE WHEN n=12 THEN 'hidden' ELSE 'published' END,
       now() - make_interval(days => sample.days, hours => ascii(d.tag)-ascii('A')),
       CASE WHEN n=12 THEN 'Учебный пример скрытого отзыва' END
FROM demo_dishes d CROSS JOIN generate_series(1,12) n
CROSS JOIN LATERAL (
    SELECT 2+(n*3+ascii(d.tag)+n/3)%4 AS rating,
        (ARRAY[1,2,4,7,10,14,18,23,29,35,56,83])[n] AS days
) sample
JOIN app_user u ON u.login='vkr_demo_review_' || n
    AND u.display_name='Учебный посетитель ' || n
    AND u.blocked AND u.role='visitor' AND u.password_hash=decode(repeat('00',48),'hex')
WHERE NOT EXISTS (SELECT 1 FROM review r WHERE r.dish_id=d.dish_id AND r.author_id=u.id)
ON CONFLICT DO NOTHING;

COMMIT;
