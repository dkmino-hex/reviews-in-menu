import { useEffect, useState, type FormEvent } from "react";
import { api, message, type Category } from "../api/client";

type Rating = { average_rating: number | null; rating_count: number };
type Point = Rating & { period: string };
type DishOption = { id: number; name: string; category_id: number };
type RatingReport = Rating & {
  dishes: (Rating & { id: number; name: string })[];
  timeline: Point[];
  dish_options: DishOption[];
};

const calendar = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Europe/Moscow" });
const ratingFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const monthDate = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" });
const ratingText = (value: number | null) => value === null ? "—" : ratingFormat.format(value);

function initialFilters() {
  const to = calendar.format(new Date());
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to, category: "", dish: "", group: "day" };
}

export function RatingAnalytics() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(draft);
  const [categories, setCategories] = useState<Category[]>([]);
  const [options, setOptions] = useState<DishOption[]>([]);
  const [report, setReport] = useState<RatingReport>();
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<Category[]>("/categories", { signal: controller.signal }).then(setCategories)
      .catch(e => { if (!controller.signal.aborted) setCategoryError(message(e)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setReport(undefined);
    setError("");
    const query = new URLSearchParams(filters);
    api<RatingReport>(`/admin/rating-analytics?${query}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setReport(data); setOptions(data.dish_options); } })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [filters]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...draft });
  }

  const dishOptions = options.filter(dish => !draft.category || dish.category_id === Number(draft.category));
  return <section className="rating-analytics" aria-labelledby="rating-analytics">
    <h2 id="rating-analytics">Аналитика оценок</h2>
    <form className="analytics-filters" onSubmit={apply}>
      <label>С даты<input type="date" required value={draft.from} max={draft.to || undefined}
        onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>По дату<input type="date" required value={draft.to} min={draft.from || undefined}
        onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <label>Категория<select value={draft.category}
        onChange={e => setDraft({ ...draft, category: e.target.value, dish: "" })}>
        <option value="">Все категории</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label>
      <label>Блюдо<select value={draft.dish} onChange={e => setDraft({ ...draft, dish: e.target.value })}>
        <option value="">Все блюда</option>
        {dishOptions.map(dish => <option key={dish.id} value={dish.id}>{dish.name}</option>)}
      </select></label>
      <label>Группировка<select value={draft.group} onChange={e => setDraft({ ...draft, group: e.target.value })}>
        <option value="day">По дням</option>
        <option value="week">По неделям</option>
        <option value="month">По месяцам</option>
      </select></label>
      <button>Показать</button>
    </form>
    <p className="analytics-note">Период включительно, время московское.</p>
    {categoryError && <p role="alert">{categoryError}</p>}
    {error ? <p role="alert">{error}</p> : !report ? <p role="status">Загружаем аналитику…</p> : <>
      <dl className="analytics-summary">
        <div><dt>Средняя оценка</dt><dd>{ratingText(report.average_rating)}</dd></div>
        <div><dt>Количество оценок</dt><dd>{report.rating_count}</dd></div>
      </dl>
      {report.rating_count === 0 && <p role="status">За выбранный период нет оценок.</p>}
      {report.dishes.length > 0 && <div className="analytics-scroll"><table>
        <caption>Оценки по блюдам</caption>
        <thead><tr><th scope="col">Блюдо</th><th scope="col">Средняя</th><th scope="col">Количество</th></tr></thead>
        <tbody>{report.dishes.map(dish => <tr key={dish.id}>
          <th scope="row"><a href={`#/dishes/${dish.id}`}>{dish.name}</a></th>
          <td>{ratingText(dish.average_rating)}</td><td>{dish.rating_count}</td>
        </tr>)}</tbody>
      </table></div>}
      {report.rating_count > 0 && <div className="analytics-charts">
        <RatingChart title="Средняя оценка" points={report.timeline} group={filters.group} average />
        <RatingChart title="Количество оценок" points={report.timeline} group={filters.group} />
        <details>
          <summary>Данные графиков</summary>
          <div className="analytics-scroll"><table>
            <thead><tr><th scope="col">Начало периода</th><th scope="col">Средняя</th><th scope="col">Количество</th></tr></thead>
            <tbody>{report.timeline.map(point => <tr key={point.period}>
              <th scope="row">{fullDate.format(new Date(point.period))}</th>
              <td>{ratingText(point.average_rating)}</td><td>{point.rating_count}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </div>}
    </>}
  </section>;
}

function RatingChart({ title, points, group, average = false }: {
  title: string; points: Point[]; group: string; average?: boolean;
}) {
  const max = average ? 5 : Math.max(1, ...points.map(point => point.rating_count));
  const labels = group === "month" ? monthDate : shortDate;
  return <figure className="analytics-chart">
    <figcaption>{title}</figcaption>
    <div className="analytics-scroll" aria-hidden="true">
      <div className="analytics-plot">
        {points.map(point => {
          const value = average ? point.average_rating : point.rating_count;
          const date = new Date(point.period);
          return <div className="analytics-column" key={point.period}
            title={`${fullDate.format(date)} · ${value === null ? "Нет оценок" : ratingFormat.format(value)}`}>
            <div className="analytics-bar-track">
              {value !== null && value > 0 && <span className="analytics-bar" style={{ height: `${value / max * 100}%` }}>
                <span>{ratingText(value)}</span>
              </span>}
            </div>
            <span>{labels.format(date)}</span>
          </div>;
        })}
      </div>
    </div>
  </figure>;
}
