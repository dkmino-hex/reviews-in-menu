BEGIN;

INSERT INTO app_user(login,display_name,password_hash,role,blocked)
SELECT 'vkr_demo_review_' || n, 'Учебный посетитель ' || n, decode(repeat('00',48),'hex'), 'visitor', true
FROM generate_series(13,14) n
ON CONFLICT (login) DO NOTHING;

WITH dishes AS (
    SELECT DISTINCT ON (d.name) d.id
    FROM dish d JOIN category c ON c.id=d.category_id
    WHERE (c.name,d.name) IN (
        ('Горячее','Паста с томатами'), ('Горячее','Овощной суп'), ('Напитки','Чай с мятой'),
        ('Горячее','Домашние котлеты'), ('Салаты','Греческий салат'), ('Десерты','Сырники со сметаной')
    )
    ORDER BY d.name,d.id
)
INSERT INTO review(dish_id,author_id,rating,body,created_at)
SELECT d.id,u.id,v.rating,v.body,now()-v.age
FROM dishes d CROSS JOIN (VALUES
    (13,3,'Порция обычного размера.',interval '4 days'),
    (14,4,'Понравился вкус, но подача могла быть аккуратнее.',interval '6 days')
) v(n,rating,body,age)
JOIN app_user u ON u.login='vkr_demo_review_'||v.n AND u.display_name='Учебный посетитель '||v.n
    AND u.blocked AND u.role='visitor' AND u.password_hash=decode(repeat('00',48),'hex')
WHERE NOT EXISTS (SELECT 1 FROM review r WHERE r.dish_id=d.id AND r.author_id=u.id)
ON CONFLICT DO NOTHING;

INSERT INTO review_opinion(review_id,source_body,label,tone)
SELECT r.id,r.body,v.label,v.tone
FROM (VALUES
    ('Соус получился насыщенным, паста упругая.','Насыщенный соус','positive'),
    ('Томатного соуса хотелось бы побольше.','Мало соуса','negative'),
    ('Лёгкий суп, овощи сохранили вкус.','Лёгкий овощной суп','positive'),
    ('Суп хотелось бы получить погорячее.','Подача недостаточно горячая','negative'),
    ('Яркий аромат мяты, чай мягкий.','Выраженный аромат мяты','positive'),
    ('Мята почти не чувствовалась.','Мало мяты','negative'),
    ('Котлеты сочные и вкусные.','Сочные котлеты','positive'),
    ('Корочка оказалась суховатой.','Суховатая корочка','negative'),
    ('Овощи хрустящие, феты много.','Свежие овощи','positive'),
    ('Заправка показалась слишком кислой.','Кисловатая заправка','negative'),
    ('Сырники нежные, сметана хорошо подходит.','Нежные сырники','positive'),
    ('Хотелось чуть меньше сахара.','Слишком сладко','negative'),
    ('Порция обычного размера.','Обычный размер порции','neutral'),
    ('Понравился вкус, но подача могла быть аккуратнее.','Понравился вкус','positive'),
    ('Понравился вкус, но подача могла быть аккуратнее.','Небрежная подача','negative')
) AS v(body,label,tone)
JOIN review r ON r.body=v.body
JOIN app_user u ON u.id=r.author_id
    AND u.login ~ '^vkr_demo_review_([1-9]|1[0-4])$'
    AND u.blocked AND u.role='visitor' AND u.password_hash=decode(repeat('00',48),'hex')
ON CONFLICT DO NOTHING;

COMMIT;
