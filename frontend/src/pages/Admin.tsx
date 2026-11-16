import { useEffect, useState, type FormEvent } from "react";
import { api, json, message, type AuditEvent, type Category, type Dish, type Page, type Visitor } from "../api/client";
import { Pagination } from "./Pagination";
import { ReviewManagement } from "./Reviews";

export function Admin() {
  const [section, setSection] = useState("menu");
  return <>
    <h1>Управление рестораном</h1>
    <div className="actions" aria-label="Разделы кабинета">
      {Object.entries({ menu: "Меню", reviews: "Отзывы", visitors: "Посетители", audit: "Журнал" }).map(([key, title]) =>
        <button key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{title}</button>)}
    </div>
    {section === "menu" ? <EditMenu /> : section === "reviews" ? <ReviewManagement admin /> :
      <AdminList key={section} visitors={section === "visitors"} />}
  </>;
}

function EditMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category>();
  const [dishes, setDishes] = useState<Page<Dish>>();
  const [dish, setDish] = useState<Dish>();
  const [page, setPage] = useState(1);
  const [revision, reload] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      api<Category[]>("/categories", { signal: c.signal }),
      api<Page<Dish>>("/dishes?page=" + page, { signal: c.signal }),
    ]).then(([cs, ds]) => { setCategories(cs); setDishes(ds); })
      .catch(e => { if (!c.signal.aborted) setError(message(e)); });
    return () => c.abort();
  }, [page, revision]);

  async function save(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await action();
      reload(n => n + 1);
      setNotice("Изменения сохранены");
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save(async () => {
      await json("/admin/categories" + (category ? "/" + category.id : ""), category ? "PUT" : "POST", { name: data.get("name") });
      setCategory(undefined);
    });
  }

  function saveDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const portion = String(data.get("portion")).trim();
    const selected = dish;
    void save(async () => {
      const result = await json<{ id: number }>("/admin/dishes" + (selected ? "/" + selected.id : ""), selected ? "PUT" : "POST", {
        category_id: Number(data.get("category")), name: data.get("name"), description: data.get("description"),
        ingredients: data.get("ingredients"), price: String(data.get("price")).trim().replace(",", "."),
        portion: portion.replace(",", ".") || null, unit: portion ? data.get("unit") : null,
        aliases: String(data.get("aliases")).split("\n").map(x => x.trim()).filter(Boolean),
      });
      setDish(await api<Dish>("/dishes/" + result.id));
    });
  }

  function upload(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("photo");
    if (!(file instanceof File) || file.size === 0) return;
    void save(async () => {
      await api("/admin/dishes/" + id + "/photo", { method: "PUT", body: file });
      setDish(await api<Dish>("/dishes/" + id));
    });
  }

  return <>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section>
      <h2>Категории</h2>
      <ul>{categories.map(c => <li key={c.id}><button disabled={busy} onClick={() => setCategory(c)}>{c.name}</button></li>)}</ul>
      <form key={category?.id ?? revision} className="stack narrow" onSubmit={saveCategory}>
        <label>{category ? "Изменить категорию" : "Новая категория"}<input name="name" defaultValue={category?.name} maxLength={80} required /></label>
        <div className="actions">
          <button disabled={busy}>Сохранить категорию</button>
          {category && <button disabled={busy} type="button" onClick={() => setCategory(undefined)}>Отмена</button>}
        </div>
      </form>
    </section>
    <section>
      <h2>Блюда</h2>
      <ul>{dishes?.items.map(d => <li key={d.id}><button disabled={busy} onClick={() => setDish(d)}>{d.name}</button></li>)}</ul>
      <Pagination page={page} more={dishes?.has_more ?? false} change={setPage} />
      <h3>{dish ? dish.name : "Новое блюдо"}</h3>
      {dish && <button disabled={busy} onClick={() => setDish(undefined)}>Новое блюдо</button>}
      <form key={`${dish?.id ?? "new"}-${revision}`} className="stack narrow" onSubmit={saveDish}>
        <label>Категория<select name="category" defaultValue={dish?.category_id ?? ""} required>
          <option value="" disabled>Выберите категорию</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>Название<input name="name" defaultValue={dish?.name} maxLength={120} required /></label>
        <label>Описание<textarea name="description" defaultValue={dish?.description} /></label>
        <label>Состав<textarea name="ingredients" defaultValue={dish?.ingredients} /></label>
        <label>Цена, ₽<input name="price" inputMode="decimal" defaultValue={dish?.price} required /></label>
        <label>Размер порции<input name="portion" inputMode="decimal" defaultValue={dish?.portion ?? ""} /></label>
        <label>Единица<select name="unit" defaultValue={dish?.unit ?? "g"}><option value="g">г</option><option value="ml">мл</option></select></label>
        <label>Варианты названия, каждый с новой строки<textarea name="aliases" defaultValue={dish?.aliases.join("\n")} /></label>
        <button disabled={busy || !categories.length}>Сохранить блюдо</button>
      </form>
      {dish && <>
        {dish.photo && <img className="dish-photo" src={dish.photo} alt={dish.name} />}
        <form key={`photo-${dish.id}-${revision}`} className="stack narrow" onSubmit={event => upload(event, dish.id)}>
          <label>Фото JPEG или PNG<input type="file" name="photo" accept="image/jpeg,image/png" required /></label>
          <div className="actions">
            <button disabled={busy}>Загрузить фото</button>
            {dish.photo && <button type="button" disabled={busy} onClick={() => void save(async () => {
              await api("/admin/dishes/" + dish.id + "/photo", { method: "DELETE" });
              setDish(await api<Dish>("/dishes/" + dish.id));
            })}>Удалить фото</button>}
          </div>
        </form>
      </>}
    </section>
  </>;
}

function AdminList({ visitors }: { visitors: boolean }) {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [since, setSince] = useState("");
  const [revision, reload] = useState(0);
  const [result, setResult] = useState<Page<Visitor | AuditEvent>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setResult(undefined);
    setError("");
    const params = new URLSearchParams({ page: String(page), entity, since });
    api<Page<Visitor | AuditEvent>>(`/admin/${visitors ? "visitors" : "audit"}?${params}`, { signal: c.signal })
      .then(setResult).catch(e => { if (!c.signal.aborted) setError(message(e)); });
    return () => c.abort();
  }, [page, revision, entity, since, visitors]);

  async function block(event: FormEvent<HTMLFormElement>, visitor: Visitor) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    setError("");
    try {
      await json("/admin/visitors/" + visitor.id, "PATCH", { blocked: !visitor.blocked, reason });
      reload(n => n + 1);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <section>
    <h2>{visitors ? "Посетители" : "Журнал действий"}</h2>
    {!visitors && <div className="filters"><label>С даты (UTC)<input type="date" value={since} onChange={e => { setSince(e.target.value); setPage(1); }} /></label><label>Объект<select value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}>
      <option value="">Все</option><option value="dish">Блюдо</option><option value="category">Категория</option><option value="visitor">Посетитель</option>
      <option value="review">Отзыв</option>
    </select></label></div>}
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p role="status">Загружаем…</p>}
    {result?.items.length === 0 && <p>Записей пока нет.</p>}
    <ul className="stack">
      {result?.items.map(item => <li key={item.id}>
        {"blocked" in item ? <>
          <strong>{item.name}</strong> ({item.login}) · {item.blocked ? "Заблокирован" : "Активен"}
          <form className="stack narrow" onSubmit={event => void block(event, item)}>
            <label>Причина<input name="reason" maxLength={250} required /></label>
            <button disabled={busy}>{item.blocked ? "Разблокировать" : "Заблокировать"}</button>
          </form>
        </> : <>{new Date(item.created_at).toLocaleString("ru")} · {item.action} · {item.entity_type} №{item.entity_id} · администратор №{item.actor_id}
          {item.details.reason && <p>{item.details.reason}</p>}</>}
      </li>)}
    </ul>
    <Pagination page={page} more={result?.has_more ?? false} change={setPage} />
  </section>;
}
