import { useState, type FormEvent } from "react";
import { json, message, type User } from "../api/client";

export function Auth({ register, onLogin }: { register: boolean; onLogin: (user: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { login: form.get("login"), password: form.get("password") };
    setBusy(true);
    setError("");
    try {
      if (register) {
        await json("/auth/register", "POST", { ...input, name: form.get("name") });
      }
      onLogin(await json<User>("/auth/login", "POST", input));
      location.hash = "#/";
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <>
    <h1>{register ? "Регистрация" : "Вход"}</h1>
    <form className="stack narrow" onSubmit={submit}>
      {register && <label>Имя<input name="name" maxLength={80} autoComplete="name" required /></label>}
      <label>Логин<input name="login" maxLength={64} autoComplete="username" required /></label>
      <label>Пароль<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required /></label>
      <button disabled={busy}>{register ? "Зарегистрироваться" : "Войти"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </>;
}

export function Profile({ user, onUpdate }: { user: User; onUpdate: (user: User | null) => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const newPassword = String(data.get("newPassword"));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await json("/me", "PATCH", { name, newPassword, currentPassword: data.get("currentPassword") });
      if (newPassword) {
        onUpdate(null);
        location.hash = "#/login";
      } else {
        onUpdate({ ...user, name });
        setNotice("Профиль сохранён");
      }
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  return <>
    <h1>Профиль</h1>
    <p>Логин {user.login}</p>
    <form className="stack narrow" onSubmit={submit}>
      <label>Имя<input name="name" defaultValue={user.name} maxLength={80} required /></label>
      <label>Текущий пароль для смены пароля<input name="currentPassword" type="password" autoComplete="current-password" /></label>
      <label>Новый пароль<input name="newPassword" type="password" minLength={8} autoComplete="new-password" /></label>
      <button disabled={busy}>Сохранить</button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  </>;
}
