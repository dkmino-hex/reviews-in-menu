import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, APIError, message, type User } from "./api/client";
import { Auth, Profile } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { DishPage, Menu } from "./pages/Menu";
import { Icon } from "./components/Icon";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/geist";
import "./style.css";
import "./branding.css";
import "./design-system.css";

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
  const category = new URLSearchParams(route.split("?")[1] ?? "").get("category") ?? "";
  return <>
    <header className="site-header"><nav aria-label="Основная навигация">
      <a href="#/" className="brand" aria-label="Разбивака — меню ресторана">Разбивака</a>
      <div className="header-actions">
      <a href="#/" className="nav-pill" aria-current={!id && !["/profile", "/admin", "/login", "/register"].includes(route) ? "page" : undefined}><Icon name="book" />Меню</a>
      {user ? <>
        <a href="#/profile" className="nav-pill" aria-current={route === "/profile" ? "page" : undefined}><Icon name="user" />Профиль</a>
        {user.role === "admin" && <a href="#/admin" className="nav-pill" aria-current={route === "/admin" ? "page" : undefined}><Icon name="settings" />Кабинет</a>}
        <button className="nav-pill" onClick={logout}><Icon name="logout" />Выйти</button>
      </> : user === undefined ? <span className="nav-pill" role="status">Проверяем сеанс…</span> : <><a href="#/login" className="nav-pill" aria-current={route === "/login" ? "page" : undefined}>Войти</a><a href="#/register" className="nav-pill nav-primary" aria-current={route === "/register" ? "page" : undefined}>Регистрация<Icon name="arrow" /></a></>}
      </div>
    </nav></header>
    <main>
      {error && <p role="alert">{error}</p>}
      {route === "/login" || route === "/register" ? <Auth key={route} register={route === "/register"} onLogin={setUser} />
        : route === "/profile" || route === "/admin" ? (
          user === undefined ? <p role="status">Проверяем сеанс…</p>
            : !user ? <p><a href="#/login">Войдите в аккаунт</a></p>
            : route === "/profile" ? <Profile user={user} onUpdate={setUser} />
            : user.role === "admin" ? <Admin /> : <p>Доступно администратору.</p>
        ) : id ? <DishPage key={id} id={id} user={user} /> : <Menu key={category} selectedCategory={category} />}
    </main>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
