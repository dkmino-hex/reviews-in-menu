export function Pagination({ page, more, change }: { page: number; more: boolean; change: (n: number) => void }) {
  return <div className="actions">
    {page > 1 && <button onClick={() => change(page - 1)}>Назад</button>}
    {more && <button onClick={() => change(page + 1)}>Дальше</button>}
  </div>;
}
