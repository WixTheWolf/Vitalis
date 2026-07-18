"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Transform.module.css";

type Readiness = "green" | "yellow" | "red";

type Template = {
  focus: string;
  calories: number;
  workout: string[];
  bedtime: string;
};

type DayPlan = Template & {
  date: Date;
  day: number;
  phase: string;
  progression: string;
};

type SavedState = {
  current?: number;
  completed?: Record<string, boolean>;
  readiness?: Record<string, Readiness>;
};

const START_DATE = new Date(2026, 6, 18);
const TOTAL_DAYS = 30;
const PROTEIN = "165 g";
const STEPS = "8–10k";
const WATER = "90–110 oz";
const STORAGE_KEY = "matthew-transformation-v2";

const TEMPLATES: Record<string, Template> = {
  Saturday: {
    focus: "Lower Body + Core",
    calories: 2250,
    bedtime: "9:30 PM",
    workout: [
      "Warm up 8 minutes: breathing, hip flexor stretch, hamstring floss and bird dog.",
      "Goblet squat — 4 × 8–10.",
      "Dumbbell Romanian deadlift — 4 × 8–10. Keep the spine neutral.",
      "Reverse lunge — 3 × 8 each side.",
      "Step-up — 3 × 10 each side.",
      "Calf raise — 3 × 15, then dead bug — 3 × 8 each side.",
    ],
  },
  Sunday: {
    focus: "Recovery + Alignment",
    calories: 2050,
    bedtime: "8:45 PM",
    workout: [
      "Walk or easy bike for 35–45 minutes.",
      "Posture reset for 10 minutes: chin tuck, wall slide, couch stretch and thoracic rotation.",
      "McGill Big 3 — 2 controlled rounds.",
      "Prepare Monday meals, clothes and training space.",
      "Optional 20–30 minute nap before 3 PM only if needed.",
    ],
  },
  Monday: {
    focus: "Upper Body Sculpt",
    calories: 2200,
    bedtime: "8:45 PM",
    workout: [
      "Incline dumbbell press — 4 × 8–12.",
      "Chest-supported row — 4 × 8–12.",
      "Supported shoulder press — 3 × 8–10.",
      "Band pulldown or assisted pull-up — 3 × 8–12.",
      "Lateral raise + rear-delt fly — 3 × 12–15 each.",
      "Pallof press — 3 × 10 each side.",
    ],
  },
  Tuesday: {
    focus: "Zone 2 + Alignment",
    calories: 2100,
    bedtime: "8:45 PM",
    workout: [
      "Bike or brisk walk for 30–35 minutes at conversational effort.",
      "90/90 breathing — 5 slow breaths.",
      "Dead bug — 3 × 8 each side.",
      "Glute bridge — 3 × 12.",
      "Wall slide + band face pull — 3 × 12 each.",
      "Hip flexor and calf stretch — 45 seconds each side.",
    ],
  },
  Wednesday: {
    focus: "Lower Body Athletic",
    calories: 2250,
    bedtime: "8:45 PM",
    workout: [
      "Goblet squat — 4 × 8–10.",
      "Split squat — 3 × 8 each side.",
      "Hip thrust or glute bridge — 4 × 10–12.",
      "Hamstring slider curl or band curl — 3 × 12.",
      "Suitcase carry — 3 × 30–40 seconds each side.",
      "Easy bike cooldown — 10 minutes.",
    ],
  },
  Thursday: {
    focus: "Recovery + Mobility",
    calories: 2050,
    bedtime: "8:45 PM",
    workout: [
      "Brisk walk for 35–40 minutes.",
      "Daily posture reset for 10 minutes.",
      "McGill Big 3 — 2 controlled rounds.",
      "Stretch calves, hip flexors, pecs and lats for 5 minutes.",
      "Finish workweek hydrated. No extra hard training.",
    ],
  },
  Friday: {
    focus: "PT + Recovery",
    calories: 2200,
    bedtime: "9:30 PM",
    workout: [
      "PT is the main training session. Do not stack a second lift.",
      "Priorities: trunk control, glutes, upper back, hip mobility and golf endurance.",
      "Recovery meal: 35–50 g protein plus a useful carbohydrate source.",
      "Easy walk later only if it feels restorative.",
      "Hydrate and protect tonight's sleep.",
    ],
  },
};

const PHASES = [
  { name: "Foundation", note: "Learn the movements. Leave 2–3 clean reps in reserve." },
  { name: "Build", note: "Add one set to the first two lifts or add 5 lb when form is clean." },
  { name: "Push", note: "Beat last week by a rep or a small load increase. Keep one rep in reserve." },
  { name: "Reveal", note: "Keep intensity, trim extra volume and protect sleep." },
];

const READINESS_NOTES: Record<Readiness, string> = {
  green: "Complete the plan as written.",
  yellow: "Remove one set from each lift and skip intervals or finishers.",
  red: "Replace loaded training with a 30-minute walk, posture reset and McGill Big 3.",
};

function phaseForDay(dayIndex: number) {
  if (dayIndex < 7) return PHASES[0];
  if (dayIndex < 14) return PHASES[1];
  if (dayIndex < 22) return PHASES[2];
  return PHASES[3];
}

function buildPlans(): DayPlan[] {
  return Array.from({ length: TOTAL_DAYS }, (_, index) => {
    const date = new Date(START_DATE);
    date.setDate(START_DATE.getDate() + index);
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
    const template = TEMPLATES[weekday];
    const phase = phaseForDay(index);
    let focus = template.focus;
    let workout = [...template.workout];

    if (index === 0) {
      workout = [
        "Record morning bodyweight and take front, side and back photos before food.",
        ...workout,
      ];
    }

    if (index === 14) {
      workout = [
        "Midpoint check: record morning bodyweight and repeat the same photos.",
        ...workout,
      ];
    }

    if (index === 28) {
      focus = "Full-Body Pump";
      workout = [
        "Two clean rounds only — do not train to failure.",
        "Incline push-up — 12.",
        "Band row — 15.",
        "Goblet squat — 12.",
        "Lateral raise — 15.",
        "Curl — 15, then glute bridge — 15.",
      ];
    }

    if (index === 29) {
      focus = "Final Reveal + Recovery";
      workout = [
        "Record morning bodyweight and final front, side and back photos before food.",
        "Walk easily for 35–45 minutes.",
        "Complete the 10-minute posture reset.",
        "Keep water and sodium normal. No dehydration tricks.",
        "Review Day 1 versus Day 30 and record the wins.",
      ];
    }

    return {
      ...template,
      day: index + 1,
      date,
      focus,
      workout,
      phase: phase.name,
      progression: phase.note,
    };
  });
}

function taskKey(dayIndex: number, taskIndex: number) {
  return `${dayIndex}:${taskIndex}`;
}

function todayIndex() {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(
    START_DATE.getFullYear(),
    START_DATE.getMonth(),
    START_DATE.getDate(),
  ).getTime();
  const diff = Math.floor((current - start) / 86_400_000);
  return Math.min(TOTAL_DAYS - 1, Math.max(0, diff));
}

export default function TransformPage() {
  const plans = useMemo(buildPlans, []);
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  const [hydrated, setHydrated] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved: SavedState = raw ? JSON.parse(raw) : {};
      setCurrent(
        typeof saved.current === "number"
          ? Math.min(TOTAL_DAYS - 1, Math.max(0, saved.current))
          : todayIndex(),
      );
      setCompleted(saved.completed ?? {});
      setReadiness(saved.readiness ?? {});
    } catch {
      setCurrent(todayIndex());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ current, completed, readiness }),
    );
  }, [current, completed, readiness, hydrated]);

  const totalTasks = plans.reduce((sum, plan) => sum + plan.workout.length + 3, 0);
  const completedCount = Object.values(completed).filter(Boolean).length;
  const progress = Math.round((completedCount / totalTasks) * 100);

  function changeDay(next: number) {
    const clamped = Math.min(TOTAL_DAYS - 1, Math.max(0, next));
    setCurrent(clamped);
  }

  function toggleTask(dayIndex: number, taskIndex: number) {
    const key = taskKey(dayIndex, taskIndex);
    setCompleted((state) => ({ ...state, [key]: !state[key] }));
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(deltaX) > 58 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      changeDay(current + (deltaX < 0 ? 1 : -1));
    }
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Matthew · 30 days</div>
          <h1 className={styles.title}>Transformation</h1>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Open instructions"
          onClick={() => setShowHelp(true)}
        >
          i
        </button>
      </header>

      <section className={styles.progressArea} aria-label="Program progress">
        <div className={styles.progressMeta}>
          <span>{completedCount} of {totalTasks} complete</span>
          <span>{progress}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div
        className={styles.viewport}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={styles.track}
          style={{ transform: `translate3d(-${current * 100}vw, 0, 0)` }}
        >
          {plans.map((plan, dayIndex) => {
            const mode = readiness[String(dayIndex)] ?? "green";
            const dayTaskOffset = 3;
            const dateText = plan.date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            });

            return (
              <article className={styles.slide} key={plan.day}>
                <div className={styles.dayTop}>
                  <div>
                    <div className={styles.date}>Day {plan.day} · {dateText}</div>
                    <h2 className={styles.focus}>{plan.focus}</h2>
                  </div>
                  <div className={styles.phase}>{plan.phase}</div>
                </div>

                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Calories</span>
                    <strong className={styles.metricValue}>{plan.calories.toLocaleString()}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Protein</span>
                    <strong className={styles.metricValue}>{PROTEIN}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Steps</span>
                    <strong className={styles.metricValue}>{STEPS}</strong>
                  </div>
                </div>

                <section className={styles.panel}>
                  <div className={styles.sectionLabel}>Readiness</div>
                  <div className={styles.readinessGrid}>
                    {(["green", "yellow", "red"] as Readiness[]).map((option) => (
                      <button
                        type="button"
                        className={`${styles.readinessButton} ${mode === option ? styles.readinessActive : ""}`}
                        key={option}
                        onClick={() =>
                          setReadiness((state) => ({ ...state, [String(dayIndex)]: option }))
                        }
                      >
                        {option[0].toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className={styles.readinessNote}>{READINESS_NOTES[mode]}</p>
                </section>

                <section className={styles.panel}>
                  <div className={styles.sectionLabel}>Non-negotiables</div>
                  <div className={styles.list}>
                    {[
                      `Hydrate: ${WATER} total. Start with 20 oz after waking.`,
                      "Eat four protein-centered meals. No alcohol.",
                      `Protect sleep. Target bedtime: ${plan.bedtime}.`,
                    ].map((task, taskIndex) => {
                      const key = taskKey(dayIndex, taskIndex);
                      const done = Boolean(completed[key]);
                      return (
                        <label className={`${styles.task} ${done ? styles.taskDone : ""}`} key={task}>
                          <input
                            className={styles.checkbox}
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleTask(dayIndex, taskIndex)}
                          />
                          <span>{task}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.panel}>
                  <div className={styles.sectionLabel}>Training</div>
                  <p className={styles.smallText}>{plan.progression}</p>
                  <div className={styles.list}>
                    {plan.workout.map((task, taskIndex) => {
                      const index = taskIndex + dayTaskOffset;
                      const key = taskKey(dayIndex, index);
                      const done = Boolean(completed[key]);
                      return (
                        <label className={`${styles.task} ${done ? styles.taskDone : ""}`} key={`${task}-${taskIndex}`}>
                          <input
                            className={styles.checkbox}
                            type="checkbox"
                            checked={done}
                            onChange={() => toggleTask(dayIndex, index)}
                          />
                          <span>{task}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.panel}>
                  <div className={styles.sectionLabel}>Nutrition + supplements</div>
                  <div className={styles.macroGrid}>
                    <div className={styles.macro}><strong>{PROTEIN}</strong><span>Protein</span></div>
                    <div className={styles.macro}><strong>25–35 g</strong><span>Fiber</span></div>
                    <div className={styles.macro}><strong>{WATER}</strong><span>Water</span></div>
                    <div className={styles.macro}><strong>{plan.calories}</strong><span>Calories</span></div>
                  </div>
                  <p className={styles.smallText} style={{ marginTop: 12 }}>
                    Morning: vitamin D3 + K2, fish oil when fish intake is low, and creatine 3–5 g. Evening: magnesium glycinate.
                  </p>
                </section>

                <p className={styles.safety}>
                  Back rule: stop if pain radiates, numbness increases or weakness appears. Switch to walking, breathing and the McGill Big 3.
                </p>
              </article>
            );
          })}
        </div>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.navButton}
          disabled={current === 0}
          onClick={() => changeDay(current - 1)}
        >
          ← Previous
        </button>
        <select
          className={styles.daySelect}
          aria-label="Select day"
          value={current}
          onChange={(event) => changeDay(Number(event.target.value))}
        >
          {plans.map((plan, index) => (
            <option value={index} key={plan.day}>Day {plan.day}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles.navButton}
          disabled={current === TOTAL_DAYS - 1}
          onClick={() => changeDay(current + 1)}
        >
          Next →
        </button>
      </footer>

      {showHelp && (
        <div className={styles.sheetBackdrop} role="presentation" onClick={() => setShowHelp(false)}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="How to use the transformation app" onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.sheetTitle}>Use it like an app</h2>
            <p className={styles.sheetText}>
              Swipe left or right between days. Tap each item when complete. Your checkmarks, readiness choices and current day save on this phone.
            </p>
            <p className={styles.sheetText}>
              In Safari, tap Share, then Add to Home Screen for a full-screen icon.
            </p>
            <button type="button" className={styles.sheetButton} onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
