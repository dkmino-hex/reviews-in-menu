import { useEffect, useState } from "react";
import { api, json, message, type Category, type Dish, type Page, type User } from "../api/client";
import { Pagination } from "./Pagination";
import { DishReviews, ReviewForm } from "./Reviews";

const prices = new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", minimumFractionDigits: 0,
});
const ratings = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function DishFeedback({ dish, excerpt = true }: { dish: Dish; excerpt?: boolean }) {
  return <>
    <p className="menu-rating">
      <span aria-hidden="true">★</span>{" "}
      {dish.average_rating === null ? "Нет оценок" : <>
        <strong>{ratings.format(dish.average_rating)} из 5</strong>
        <span className="menu-rating-count"> · всего {dish.rating_count}</span>
      </>}
    </p>
    {excerpt && (dish.review_excerpt ? <figure className="menu-opinion">
      <figcaption>Из отзывов</figcaption>
      <blockquote><p>«{dish.review_excerpt}»</p></blockquote>
    </figure> : <p className="menu-no-opinion">Пока нет комментариев</p>)}
  </>;
}

export function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Dish>>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<Category[]>("/categories", { signal: controller.signal })
      .then(setCategories).catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), q: query, category });
      api<Page<Dish>>("/dishes?" + params, { signal: controller.signal }).then(setResult)
        .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, query, page]);

  return <div className="menu-book">
    <div className="menu-cover">
      <h1>меню</h1>
      <div className="filters menu-filters">
        <label>Название блюда<input type="search" placeholder="Найти блюдо" maxLength={120} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
        <label>Категория<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="">Все категории</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      </div>
    </div>
    <div className="menu-paper" aria-busy={!result && !error}>
    {error ? <p className="menu-status" role="alert">{error}</p> : !result ? <p className="menu-status" role="status">Загружаем меню…</p> : <>
      {result.items.length === 0 && <p className="menu-status">Блюда не найдены.</p>}
      <ul className="menu-spread">
        {result.items.map(d => <li className="menu-leaf" key={d.id}>
          <p className="menu-category">{categories.find(c => c.id === d.category_id)?.name}</p>
          <h2><a href={`#/dishes/${d.id}`}>{d.name}</a></h2>
          <div className="menu-photo">
            {d.photo ? <img src={d.photo} alt={d.name} loading="lazy" /> : <span>Фото скоро появится</span>}
          </div>
          <p className="menu-price">{prices.format(Number(d.price))}</p>
          <DishFeedback dish={d} />
        </li>)}
      </ul>
      {(page > 1 || result.has_more) && <div className="menu-pages">
        <Pagination page={page} more={result.has_more} change={setPage} />
      </div>}
    </>}
    </div>
  </div>;
}

export function DishPage({ id, user }: { id: string; user: User | null | undefined }) {
  const [dish, setDish] = useState<Dish>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Dish>("/dishes/" + encodeURIComponent(id), { signal: controller.signal }).then(setDish)
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [id, revision]);

  return <>
    <a href="#/">К меню</a>
    {error ? <p role="alert">{error}</p> : !dish ? <p role="status">Загружаем блюдо…</p> : <>
      <h1>{dish.name}</h1>
      {dish.photo && <img className="dish-photo" src={dish.photo} alt={dish.name} />}
      <p>{dish.description}</p>
      {dish.ingredients && <p><strong>Состав</strong> {dish.ingredients}</p>}
      <p>{dish.price} ₽ {dish.portion && ` · ${dish.portion} ${dish.unit === "g" ? "г" : "мл"}`}</p>
      <DishFeedback dish={dish} excerpt={false} />
      {user?.role === "visitor" && <section>
        <ReviewForm submit={input => json(`/dishes/${dish.id}/reviews`, "POST", input)} saved={() => setRevision(n => n + 1)} />
        <p><a href="#/profile">Мои отзывы</a></p>
      </section>}
      {user === null && <p><a href="#/login">Войдите, чтобы оставить отзыв</a></p>}
      <DishReviews key={revision} dishID={dish.id} />
    </>}
  </>;
}
