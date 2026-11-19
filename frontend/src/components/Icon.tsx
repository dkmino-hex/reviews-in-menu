const paths = {
  book: "M12 7v14m0-14C9 4 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7 0-10 3Z",
  user: "M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  logout: "M9 21H4V3h5m6 4 5 5-5 5m-7-5h12",
  arrow: "M5 12h14m-6-6 6 6-6 6",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
