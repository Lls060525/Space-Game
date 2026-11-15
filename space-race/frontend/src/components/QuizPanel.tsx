import { useEffect, useState } from "react";
import { sfx } from "../lib/sfx";

export interface QuizQuestion { id: string; topic: string; q: string; options: string[] }
export interface QuizFeedback { question_id: string; choice: number; answer: number; correct: boolean; explain: string; bonus: number }

/**
 * Mission Control challenge: answer a physics question, earn extra budget.
 * Works for PvP (server grades → `feedback` arrives over the socket) and for solo practice
 * (the parent grades locally and passes `feedback`).
 */
export function QuizPanel({ questions, idx, correct, bonus, perQuestion, feedback, onAnswer, onDismiss }: {
  questions: QuizQuestion[]; idx: number; correct: number; bonus: number; perQuestion: number;
  feedback: QuizFeedback | null; onAnswer: (q: QuizQuestion, choice: number) => void; onDismiss: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { if (!feedback) setPicked(null); }, [idx, feedback]);   // unlock if the server rejected an answer
  if (questions.length === 0) return null;
  const done = idx >= questions.length;
  const fbQuestion = feedback ? questions.find((q) => q.id === feedback.question_id) : undefined;
  const current = feedback && fbQuestion ? fbQuestion : questions[idx];

  return (
    <section className={`quiz ${open ? "" : "collapsed"}`}>
      <div className="quiz-head" onClick={() => setOpen((o) => !o)}>
        <span>📡 <b>Mission Control challenge</b> · {Math.min(idx + (feedback ? 0 : 1), questions.length)}/{questions.length}</span>
        <span className="small">
          {correct} correct · <span className="good-text">+${bonus}M budget earned</span> · {open ? "▲" : "▼"}
        </span>
      </div>
      {open && (
        done && !feedback ? (
          <div className="quiz-body small muted">
            All challenges answered: {correct}/{questions.length} right, +${bonus}M added to your cost cap. Nice flying.
          </div>
        ) : current ? (
          <div className="quiz-body">
            <div className="muted small">{current.topic} · answer correctly for <b className="good-text">+${perQuestion}M</b></div>
            <div className="quiz-q">{current.q}</div>
            <div className="quiz-options">
              {current.options.map((o, i) => {
                const cls = feedback ? (i === feedback.answer ? "right" : i === feedback.choice ? "wrong" : "") : picked === i ? "picked" : "";
                return (
                  <button key={i} className={`quiz-opt ${cls}`} disabled={!!feedback || picked !== null}
                          onClick={() => { sfx.click(); setPicked(i); onAnswer(current, i); }}>
                    <span className="mono">{"ABCD"[i]}</span> {o}
                  </button>
                );
              })}
            </div>
            {feedback && (
              <div className={`quiz-fb ${feedback.correct ? "good" : "bad"}`}>
                <b>{feedback.correct ? `✅ Correct! +$${feedback.bonus}M budget` : "❌ Not quite."}</b>
                <div className="small">{feedback.explain}</div>
                <button className="primary" onClick={() => { setPicked(null); onDismiss(); }}>
                  {idx >= questions.length ? "Finish" : "Next challenge →"}
                </button>
              </div>
            )}
          </div>
        ) : null
      )}
    </section>
  );
}
