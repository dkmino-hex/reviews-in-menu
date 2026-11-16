import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, APIError, message, type User } from "./api/client";
import { Auth, Profile } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { DishPage, Menu } from "./pages/Menu";
import "./style.css";

function App() {
  const [route, setRoute] = useState(location.hash.slice(1));
  const [user, setUser] = useState<User | null | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1));
    window.addEventListener("hashchange", update);
    const controller = new AbortController();
    api<User>("/me", { signal: controller.signal }).then(setUser).catch(e => {
      if (controller.signal.aborted) return;
      if (!(e instanceof APIError && e.status === 401)) setError(message(e));
      setUser(null);
    });
    return () => { window.removeEventListener("hashchange", update); controller.abort(); };
  }, []);

  async function logout() {
    setError("");
    try { await api("/auth/logout", { method: "POST" }); setUser(null); location.hash = "#/"; }
    catch (e) { setError(message(e)); }
  }

  const id = /^\/dishes\/([^/]+)$/.exec(route)?.[1];
  return <>
    <header><nav aria-label="Основная навигация">
      <a href="#/" className="brand">Reviews in menu</a>
      {user ? <>
        <a href="#/profile">Профиль</a>
        {user.role === "admin" && <a href="#/admin">Кабинет</a>}
        <button onClick={logout}>Выйти</button>
      </> : <><a href="#/login">Войти</a><a href="#/register">Регистрация</a></>}
    </nav></header>
    <main>
      {error && <p role="alert">{error}</p>}
      {route === "/login" || route === "/register" ? <Auth key={route} register={route === "/register"} onLogin={setUser} />
        : route === "/profile" || route === "/admin" ? (
          user === undefined ? <p role="status">Проверяем сеанс…</p>
            : !user ? <p><a href="#/login">Войдите в аккаунт</a></p>
            : route === "/profile" ? <Profile user={user} onUpdate={setUser} />
            : user.role === "admin" ? <Admin /> : <p>Доступно администратору.</p>
        ) : id ? <DishPage key={id} id={id} user={user} /> : <Menu />}
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
