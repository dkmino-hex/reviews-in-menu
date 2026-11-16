import type { OpinionSummary, Tone } from "../api/client";

const toneLabels: Record<Tone, string> = {
  positive: "Позитивные", negative: "Негативные", neutral: "Нейтральные", mixed: "Смешанные",
};
const toneOrder: Tone[] = ["positive", "negative", "neutral", "mixed"];

export function ReviewTone({ tone }: { tone: Tone }) {
  return <span className={`review-tone tone-${tone}`}>{toneLabels[tone]}</span>;
}

export function Opinions({ summary }: { summary: OpinionSummary }) {
  if (!summary.sample) return <p className="menu-no-opinion">Пока нет сводки по отзывам</p>;
  return <div className="dish-opinions">
    <p className="opinions-title">Мнения гостей <small>за 30 дней · учебная сводка</small></p>
    <div className="opinion-bar" aria-hidden="true">
      {toneOrder.map(tone => {
        const count = summary.tones[tone] ?? 0;
        return count > 0 && <span key={tone} className={`tone-${tone}`} style={{ flexGrow: count }} />;
      })}
    </div>
    <ul className="opinion-legend" aria-label="Тональность отзывов">
      {toneOrder.map(tone => <li key={tone}><ReviewTone tone={tone} /> <strong>{summary.tones[tone] ?? 0}</strong></li>)}
    </ul>
    <ul className="opinion-highlights" aria-label="Популярные мнения">
      {summary.highlights.map(opinion => <li key={`${opinion.tone}:${opinion.label}`} className={`tone-${opinion.tone}`}>
        <span>{opinion.label}</span><small aria-label={`Отзывов: ${opinion.count}`}>{opinion.count}</small>
      </li>)}
    </ul>
  </div>;
}
