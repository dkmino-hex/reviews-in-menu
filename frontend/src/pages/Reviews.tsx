import { useEffect, useState, type FormEvent } from "react";
import { api, json, message, type ManagedReview, type Page, type Review } from "../api/client";
import { Pagination } from "./Pagination";
import { ReviewTone } from "./Opinions";

const dates = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const states = { published: "Опубликован", hidden: "Скрыт", archived: "В архиве" };

function useReviewPage<T>(path: string) {
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState<Page<T>>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    api<Page<T>>(`${path}?page=${page}`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (page > 1 && !data.items.length) setPage(page - 1);
        else setResult(data);
      })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, [path, page, revision]);
  return { page, setPage, result, error, reload: () => refresh(n => n + 1) };
}

type ReviewInput = { rating: number; body: string };

export function ReviewForm({ review, submit, saved }: {
  review?: ManagedReview;
  submit: (input: ReviewInput, replace: boolean) => Promise<void>;
  saved: (replace: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const replace = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "replace";
    if (replace && !window.confirm("Опубликовать новый отзыв и перенести прежний в архив?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submit({ rating: Number(data.get("rating")), body: String(data.get("body")) }, replace);
      if (!review) form.reset();
      setNotice("Отзыв сохранён");
      saved(replace);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <form onSubmit={send}>
    <fieldset className="stack narrow" disabled={busy}>
      <legend>{review ? "Правка отзыва" : "Оставить отзыв"}</legend>
      <label>Оценка<select name="rating" required defaultValue={review?.rating ?? ""}>
        <option value="" disabled>Выберите оценку</option>
        {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating}</option>)}
      </select></label>
      <label>Комментарий (необязательно)<textarea name="body" rows={3} maxLength={3000} defaultValue={review?.body} /></label>
      <div className="actions">
        <button>{review ? "Сохранить правку" : "Опубликовать"}</button>
        {review?.publication_state === "published" &&
          <button value="replace">Заменить отзыв</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </fieldset>
  </form>;
}

export function DishReviews({ dishID }: { dishID: number }) {
  const { page, setPage, result, error } = useReviewPage<Review>(`/dishes/${dishID}/reviews`);
  return <section aria-labelledby="dish-reviews">
    <h2 id="dish-reviews">Комментарии гостей</h2>
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Загружаем отзывы…</p> : <>
      {result.items.length === 0 ? <p>Пока нет комментариев.</p> : <ul className="review-list">
        {result.items.map(review => <li key={review.id}>
          <p className="actions"><strong>{review.rating} из 5</strong><span>{dates.format(new Date(review.created_at))}</span>
            {review.tone && <ReviewTone tone={review.tone} />}
          </p>
          <p className="review-body">{review.body}</p>
        </li>)}
      </ul>}
      <Pagination page={page} more={result.has_more} change={setPage} />
    </>}
  </section>;
}

export function ReviewManagement({ admin = false }: { admin?: boolean }) {
  const path = admin ? "/admin/reviews" : "/me/reviews";
  const { page, setPage, result, error, reload } = useReviewPage<ManagedReview>(path);
  const [notice, setNotice] = useState("");

  return <section aria-labelledby="review-management">
    <h2 id="review-management">{admin ? "Модерация отзывов" : "Мои отзывы"}</h2>
    <button type="button" onClick={reload}>Обновить отзывы</button>
    {notice && <p role="status">{notice}</p>}
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Загружаем отзывы…</p> : <>
      {result.items.length === 0 && <p>Отзывов пока нет.</p>}
      <ul className="review-list">
        {result.items.map(review => <ReviewRow key={review.id} review={review} admin={admin} path={`${path}/${review.id}`}
          saved={text => { setNotice(text); reload(); }} />)}
      </ul>
      <Pagination page={page} more={result.has_more} change={setPage} />
    </>}
  </section>;
}

function ReviewRow({ review, admin, path, saved }: {
  review: ManagedReview; admin: boolean; path: string; saved: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hidden = review.publication_state === "hidden";

  async function moderate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? (hidden ? "restore" : "hide");
    if (action === "remove" && !window.confirm("Удалить отзыв и закрыть повторную публикацию для этого блюда?")) return;
    const data = new FormData(event.currentTarget);
    await perform(() => json(path, "PATCH", { action, reason: data.get("reason") ?? "", version: review.version }),
      action === "hide" ? "Отзыв скрыт" : action === "restore" ? "Отзыв восстановлен" : "Отзыв удалён");
  }

  async function perform(call: () => Promise<void>, notice: string) {
    setBusy(true);
    setError("");
    try { await call(); saved(notice); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <li>
    <h3><a href={`#/dishes/${review.dish_id}`}>{review.dish_name}</a></h3>
    <p><strong>{review.rating} из 5</strong> · {states[review.publication_state]} · {dates.format(new Date(review.created_at))}</p>
    <p className="review-body">{review.body || "Без комментария"}</p>
    {review.moderation_reason && <p>Причина скрытия — {review.moderation_reason}</p>}
    {review.archived_at && <p>В архиве с {dates.format(new Date(review.archived_at))}</p>}
    {admin ? <form onSubmit={moderate} className="stack narrow">
      {!hidden && <label>Причина скрытия<input name="reason" maxLength={300} required /></label>}
      <div className="actions">
        <button disabled={busy} value={hidden ? "restore" : "hide"}>{hidden ? "Восстановить" : "Скрыть"}</button>
        <button disabled={busy} value="remove" formNoValidate>Удалить</button>
      </div>
    </form> : review.publication_state !== "archived" && <>
      <div className="actions">
        <button disabled={busy} aria-expanded={editing} onClick={() => setEditing(value => !value)}>{editing ? "Отменить правку" : "Изменить"}</button>
        <button disabled={busy || editing} onClick={() => {
          if (window.confirm("Удалить отзыв?")) void perform(() => api(path, { method: "DELETE" }), "Отзыв удалён");
        }}>Удалить</button>
      </div>
      {editing && <ReviewForm review={review}
        submit={(input, replace) => json(replace ? `${path}/replace` : path, replace ? "POST" : "PATCH", { ...input, version: review.version })}
        saved={replace => saved(replace ? "Новый отзыв опубликован, прежний в архиве" : "Отзыв сохранён")} />}
    </>}
    {error && <p role="alert">{error}</p>}
  </li>;
}
