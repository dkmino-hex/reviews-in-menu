export function Stars({ rating }: { rating: number }) {
  return <span className="review-stars" role="img" aria-label={`Оценка ${rating} из 5`}>
    {[1, 2, 3, 4, 5].map(star => <svg key={star} viewBox="0 0 24 24" className={star <= rating ? "is-filled" : ""} aria-hidden="true"><path d="m12 2 3 6.1 6.7 1-4.9 4.8 1.2 6.7-6-3.2-6 3.2 1.2-6.7-4.9-4.8 6.7-1Z" /></svg>)}
  </span>;
}
