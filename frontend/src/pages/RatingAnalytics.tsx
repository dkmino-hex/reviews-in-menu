import { useEffect, useState, type FormEvent } from "react";
import { api, message, type Category } from "../api/client";
import { Select } from "../components/Select";
import { DatePicker } from "../components/DatePicker";
import { ScrollArea } from "../components/ScrollArea";

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
      <div className="field-label">С даты<DatePicker label="С даты" required value={draft.from} max={draft.to}
        onChange={from => setDraft({ ...draft, from })} /></div>
      <div className="field-label">По дату<DatePicker label="По дату" required value={draft.to} min={draft.from}
        onChange={to => setDraft({ ...draft, to })} /></div>
      <div className="field-label">Категория<Select label="Категория аналитики" value={draft.category}
        onChange={category => setDraft({ ...draft, category, dish: "" })}
        options={[{ value: "", label: "Все категории" }, ...categories.map(c => ({ value: String(c.id), label: c.name }))]} /></div>
      <div className="field-label">Блюдо<Select label="Блюдо аналитики" value={draft.dish} onChange={dish => setDraft({ ...draft, dish })}
        options={[{ value: "", label: "Все блюда" }, ...dishOptions.map(d => ({ value: String(d.id), label: d.name }))]} /></div>
      <div className="field-label">Группировка<Select label="Группировка" value={draft.group} onChange={group => setDraft({ ...draft, group })}
        options={[{ value: "day", label: "По дням" }, { value: "week", label: "По неделям" }, { value: "month", label: "По месяцам" }]} /></div>
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
      {report.dishes.length > 0 && <ScrollArea label="Оценки по блюдам"><table>
        <caption>Оценки по блюдам</caption>
        <thead><tr><th scope="col">Блюдо</th><th scope="col">Средняя</th><th scope="col">Количество</th></tr></thead>
        <tbody>{report.dishes.map(dish => <tr key={dish.id}>
          <th scope="row"><a href={`#/dishes/${dish.id}`}>{dish.name}</a></th>
          <td>{ratingText(dish.average_rating)}</td><td>{dish.rating_count}</td>
        </tr>)}</tbody>
      </table></ScrollArea>}
      {report.rating_count > 0 && <div className="analytics-charts">
        <RatingChart title="Средняя оценка" points={report.timeline} group={filters.group} average />
        <RatingChart title="Количество оценок" points={report.timeline} group={filters.group} />
        <details>
          <summary>Данные графиков</summary>
          <ScrollArea label="Данные графиков"><table>
            <thead><tr><th scope="col">Начало периода</th><th scope="col">Средняя</th><th scope="col">Количество</th></tr></thead>
            <tbody>{report.timeline.map(point => <tr key={point.period}>
              <th scope="row">{fullDate.format(new Date(point.period))}</th>
              <td>{ratingText(point.average_rating)}</td><td>{point.rating_count}</td>
            </tr>)}</tbody>
          </table></ScrollArea>
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
    <ScrollArea label={`График: ${title}`}>
      <div className="analytics-plot" aria-hidden="true">
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
    </ScrollArea>
  </figure>;
}
