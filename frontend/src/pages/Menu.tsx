import { useEffect, useRef, useState } from "react";
import { api, json, message, type Category, type Dish, type Page, type User } from "../api/client";
import { DishReviews, ReviewForm } from "./Reviews";
import { Opinions } from "./Opinions";

const prices = new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", minimumFractionDigits: 0,
});
const ratings = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function DishFeedback({ dish }: { dish: Dish }) {
  return <>
    <p className="menu-rating">
      <span aria-hidden="true">★</span>{" "}
      {dish.average_rating === null ? "Нет оценок" : <>
        <strong>{ratings.format(dish.average_rating)} из 5</strong>
        <span className="menu-rating-count"> · всего {dish.rating_count}</span>
      </>}
    </p>
    <Opinions summary={dish.opinions} />
  </>;
}

export function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [spread, setSpread] = useState(0);
  const [direction, setDirection] = useState("forward");
  const [result, setResult] = useState<Page<Dish>>();
  const [error, setError] = useState("");
  const catalog = useRef<HTMLElement>(null);
  // The catalogue API returns 20 dishes per page, or ten two-page spreads.
  const page = Math.floor(spread / 10) + 1;
  const offset = (spread % 10) * 2;
  const more = !!result && (offset + 2 < result.items.length || result.has_more);

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

  function openBook() {
    catalog.current?.focus({ preventScroll: true });
    catalog.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function turnBook(step: -1 | 1) {
    if (step === -1 ? !spread : !more) return;
    setDirection(step === 1 ? "forward" : "back");
    setSpread(spread + step);
  }

  return <div className="menu-book">
    <div className="book-hero">
      <div className="book-intro">
        <h1>меню</h1>
        <p>Блюда и впечатления гостей</p>
        <button className="paper-button" onClick={openBook}>Открыть меню <span aria-hidden="true">↘</span></button>
      </div>
      <div className="book-object" aria-hidden="true">
        <div className="book-page-edge"></div>
        <div className="book-cover">
          <div className="book-label"><span>Review Breaker</span><b>Меню</b></div>
          <span className="book-sticker">✷</span>
        </div>
        <span className="book-bookmark"></span>
      </div>
    </div>
    <section className="book-catalog" ref={catalog} tabIndex={-1} aria-label="Блюда меню">
      <div className="filters menu-filters">
        <label>Название блюда<input type="search" placeholder="Найти блюдо" maxLength={120} value={query} onChange={e => { setQuery(e.target.value); setSpread(0); }} /></label>
        <label>Категория<select value={category} onChange={e => { setCategory(e.target.value); setSpread(0); }}>
          <option value="">Все категории</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      </div>
      <div className="menu-paper" aria-busy={!result && !error}>
        {error ? <p className="menu-status" role="alert">{error}</p> : !result ? <p className="menu-status" role="status">Загружаем меню…</p> :
          result.items.length === 0 ? <p className="menu-status">Блюда не найдены.</p> :
          <ul className={`menu-spread turn-${direction}`} key={spread}>
            {result.items.slice(offset, offset + 2).map(d => <li className="menu-leaf" key={d.id}>
              <p className="menu-category">{categories.find(c => c.id === d.category_id)?.name}</p>
              <h2><a href={`#/dishes/${d.id}`}>{d.name}</a></h2>
              <div className="menu-photo">
                {d.photo ? <img src={d.photo} alt={d.name} loading="lazy" /> : <span>Фото скоро появится</span>}
              </div>
              <div>
                <p className="menu-price">{prices.format(Number(d.price))}</p>
                <DishFeedback dish={d} />
              </div>
            </li>)}
          </ul>}
        {(spread > 0 || more) && <div className="menu-pages" role="group" aria-label="Перелистывание меню">
          <button disabled={spread === 0} onClick={() => turnBook(-1)}><span aria-hidden="true">← </span>Назад</button>
          <span aria-live="polite">Разворот {spread + 1}</span>
          <button disabled={!more} onClick={() => turnBook(1)}>Дальше<span aria-hidden="true"> →</span></button>
        </div>}
      </div>
    </section>
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
      <DishFeedback dish={dish} />
      {user?.role === "visitor" && <section>
        <ReviewForm submit={input => json(`/dishes/${dish.id}/reviews`, "POST", input)} saved={() => setRevision(n => n + 1)} />
        <p><a href="#/profile">Мои отзывы</a></p>
      </section>}
      {user === null && <p><a href="#/login">Войдите, чтобы оставить отзыв</a></p>}
      <DishReviews key={revision} dishID={dish.id} />
    </>}
  </>;
}
