import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, json, message, type ManagedReview, type Page, type PublicReview, type ReviewFeedback, type User } from "../api/client";
import { Pagination } from "./Pagination";
import { ReviewTone } from "./Opinions";
import { Stars } from "../components/Stars";
import { Icon } from "../components/Icon";
import { ConfirmDialog } from "../components/ConfirmDialog";

const dates = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const states = { published: "Опубликован", hidden: "Скрыт", archived: "В архиве" };

function useReviewPage<T>(path: string) {
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [result, setResult] = useState<Page<T>>();
  const [error, setError] = useState("");
  const previousQuery = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    const query = `${path}?page=${page}`;
    if (previousQuery.current !== query) setResult(undefined);
    previousQuery.current = query;
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
  const [replacement, setReplacement] = useState<ReviewInput>();

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const replace = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "replace";
    const input = { rating: Number(data.get("rating")), body: String(data.get("body")) };
    if (replace) { setReplacement(input); return; }
    await save(input, false, form);
  }

  async function save(input: ReviewInput, replace: boolean, form?: HTMLFormElement) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submit(input, replace);
      if (!review) form?.reset();
      setNotice("Отзыв сохранён");
      saved(replace);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <><form className="review-sheet" onSubmit={send}>
    <fieldset className="stack review-fields" disabled={busy}>
      <legend>{review ? "Правка отзыва" : "Оставить отзыв"}</legend>
      <fieldset className="rating-choice">
        <legend>Оценка</legend>
        {[1, 2, 3, 4, 5].map(rating => <label key={rating}>
          <input type="radio" name="rating" value={rating} required defaultChecked={review?.rating === rating} />
          <span>{rating}<span aria-hidden="true">★</span></span>
        </label>)}
      </fieldset>
      <label>Комментарий (необязательно)<textarea name="body" rows={4} maxLength={3000} defaultValue={review?.body} /></label>
      <div className="actions">
        <button className="paper-button">{review ? "Сохранить правку" : "Опубликовать"}</button>
        {review?.publication_state === "published" &&
          <button className="paper-button" value="replace">Заменить отзыв</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </fieldset>
  </form>
    {replacement && <ConfirmDialog title="Заменить отзыв?" text="Новый отзыв будет опубликован, а предыдущий перейдёт в архив."
      cancel={() => setReplacement(undefined)} confirm={() => { const input = replacement; setReplacement(undefined); void save(input, true); }} />}
  </>;
}

export function DishReviews({ dishID, user }: { dishID: number; user: User | null | undefined }) {
  const { page, setPage, result, error, reload } = useReviewPage<PublicReview>(`/dishes/${dishID}/reviews`);
  return <section aria-labelledby="dish-reviews">
    <h2 id="dish-reviews">Комментарии гостей</h2>
    <p className="review-sort-note">Сначала полезные — по отметкам гостей</p>
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Загружаем отзывы…</p> : <>
      {result.items.length === 0 ? <p>Пока нет комментариев.</p> : <ul className="review-list">
        {result.items.map(review => <ReviewComment key={review.id} review={review} user={user} reload={reload} />)}
      </ul>}
      <Pagination page={page} more={result.has_more} change={setPage} />
    </>}
  </section>;
}

function ReviewComment({ review, user, reload }: { review: PublicReview; user: User | null | undefined; reload: () => void }) {
  const [feedback, setFeedback] = useState<ReviewFeedback>(review);
  useEffect(() => setFeedback(review), [review]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function vote(choice: -1 | 1) {
    setBusy(true); setError("");
    try {
      setFeedback(await json<ReviewFeedback>(`/reviews/${review.id}/helpfulness`, "PUT", { vote: feedback.my_vote === choice ? 0 : choice }));
      reload();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return <li>
    <div className="review-meta"><Stars rating={review.rating} /><time dateTime={review.created_at}>{dates.format(new Date(review.created_at))}</time>
      {review.tone && <ReviewTone tone={review.tone} />}</div>
    <p className="review-body">{review.body}</p>
    <div className="review-votes" role="group" aria-label="Полезность комментария">
      <span>Было полезно?</span>
      <button type="button" aria-pressed={feedback.my_vote === 1} disabled={busy || !feedback.can_vote} onClick={() => void vote(1)}><Icon name="up" />Полезно <b>{feedback.helpful}</b></button>
      <button type="button" aria-pressed={feedback.my_vote === -1} disabled={busy || !feedback.can_vote} onClick={() => void vote(-1)}><Icon name="down" />Не полезно <b>{feedback.unhelpful}</b></button>
    </div>
    {!user && <p className="review-vote-note"><a href="#/login">Войдите</a>, чтобы отметить полезность</p>}
    {user && !feedback.can_vote && <p className="review-vote-note">Это ваш комментарий</p>}
    {error && <p role="alert">{error}</p>}
  </li>;
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
  const [confirmation, setConfirmation] = useState<"delete" | "remove">();
  const [removeReason, setRemoveReason] = useState("");

  async function moderate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? (hidden ? "restore" : "hide");
    const data = new FormData(event.currentTarget);
    if (action === "remove") { setRemoveReason(String(data.get("reason") ?? "")); setConfirmation("remove"); return; }
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
    <div className="review-meta"><Stars rating={review.rating} /><span>{states[review.publication_state]}</span><time dateTime={review.created_at}>{dates.format(new Date(review.created_at))}</time></div>
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
        <button disabled={busy || editing} onClick={() => setConfirmation("delete")}>Удалить</button>
      </div>
      {editing && <ReviewForm review={review}
        submit={(input, replace) => json(replace ? `${path}/replace` : path, replace ? "POST" : "PATCH", { ...input, version: review.version })}
        saved={replace => saved(replace ? "Новый отзыв опубликован, прежний в архиве" : "Отзыв сохранён")} />}
    </>}
    {error && <p role="alert">{error}</p>}
    {confirmation && <ConfirmDialog title="Удалить отзыв?" text={confirmation === "remove" ? "Отзыв будет удалён. Повторная публикация для этого блюда станет недоступна автору." : "Отзыв будет удалён из вашего профиля и карточки блюда."}
      cancel={() => setConfirmation(undefined)} confirm={() => {
        const action = confirmation; setConfirmation(undefined);
        void perform(() => action === "remove" ? json(path, "PATCH", { action, reason: removeReason, version: review.version }) : api(path, { method: "DELETE" }), "Отзыв удалён");
      }} />}
  </li>;
}
