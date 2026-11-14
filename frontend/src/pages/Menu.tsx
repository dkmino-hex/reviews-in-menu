import { useEffect, useState } from "react";
import { api, message, type Category, type Dish, type Page } from "../api/client";

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

  return <>
    <h1>Меню</h1>
    <div className="filters">
      <label>Название блюда<input type="search" maxLength={120} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      <label>Категория<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
        <option value="">Все категории</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
    </div>
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Загружаем меню…</p> : <>
      {result.items.length === 0 && <p>Блюда не найдены.</p>}
      <ul className="cards">
        {result.items.map(d => <li key={d.id}>
          {d.photo && <img src={d.photo} alt="" loading="lazy" />}
          <h2><a href={`#/dishes/${d.id}`}>{d.name}</a></h2>
          <p>{categories.find(c => c.id === d.category_id)?.name}</p>
          <p>{d.price} ₽</p>
        </li>)}
      </ul>
      <Pagination page={page} more={result.has_more} change={setPage} />
    </>}
  </>;
}

export function Pagination({ page, more, change }: { page: number; more: boolean; change: (n: number) => void }) {
  return <div className="actions">
    {page > 1 && <button onClick={() => change(page - 1)}>Назад</button>}
    {more && <button onClick={() => change(page + 1)}>Дальше</button>}
  </div>;
}

export function DishPage({ id }: { id: string }) {
  const [dish, setDish] = useState<Dish>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Dish>("/dishes/" + encodeURIComponent(id), { signal: controller.signal }).then(setDish)
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [id]);

  return <>
    <a href="#/">К меню</a>
    {error ? <p role="alert">{error}</p> : !dish ? <p role="status">Загружаем блюдо…</p> : <>
      <h1>{dish.name}</h1>
      {dish.photo && <img className="dish-photo" src={dish.photo} alt={dish.name} />}
      <p>{dish.description}</p>
      {dish.ingredients && <p><strong>Состав</strong> {dish.ingredients}</p>}
      <p>{dish.price} ₽ {dish.portion && ` · ${dish.portion} ${dish.unit === "g" ? "г" : "мл"}`}</p>
      <p>Нет оценок</p>
    </>}
  </>;
}
