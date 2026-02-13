import React from "react";

interface OnboardingTask {
  done: boolean;
  key: string;
  label: string;
}

interface ContactsChecklistProps {
  contactsOnboardingCelebrating: boolean;
  dismissContactsOnboarding: () => void;
  onShowHow: (taskKey: string) => void;
  progressPercent: number;
  t: (key: string) => string;
  tasks: readonly OnboardingTask[];
  tasksCompleted: number;
  tasksTotal: number;
}

export function ContactsChecklist({
  contactsOnboardingCelebrating,
  dismissContactsOnboarding,
  onShowHow,
  progressPercent,
  t,
  tasks,
  tasksCompleted,
  tasksTotal,
}: ContactsChecklistProps): React.ReactElement {
  const isComplete =
    contactsOnboardingCelebrating || tasksCompleted === tasksTotal;

  return (
    <section className="panel panel-plain contacts-checklist">
      <div className="contacts-checklist-header">
        <div className="contacts-checklist-title">
          {t("contactsOnboardingTitle")}
        </div>
        <button
          type="button"
          className="contacts-checklist-close"
          onClick={dismissContactsOnboarding}
          aria-label={t("contactsOnboardingDismiss")}
          title={t("contactsOnboardingDismiss")}
        >
          ×
        </button>
      </div>

      <div className="contacts-checklist-progressRow">
        <div className="contacts-checklist-progress" aria-hidden="true">
          <div
            className="contacts-checklist-progressFill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="contacts-checklist-progressText">
          {String(t("contactsOnboardingProgress"))
            .replace(/\{done\}/g, String(tasksCompleted))
            .replace(/\{total\}/g, String(tasksTotal))}
        </div>
      </div>

      {isComplete ? (
        <div className="contacts-checklist-done" role="status">
          <span className="contacts-checklist-doneIcon" aria-hidden="true">
            ✓
          </span>
          <span>
            <div className="contacts-checklist-doneTitle">
              {t("contactsOnboardingCompletedTitle")}
            </div>
            <div className="contacts-checklist-doneBody">
              {t("contactsOnboardingCompletedBody")}
            </div>
          </span>
        </div>
      ) : (
        <div className="contacts-checklist-items" role="list">
          {tasks.map((task) => (
            <div
              key={task.key}
              className={
                task.done
                  ? "contacts-checklist-item is-done"
                  : "contacts-checklist-item"
              }
              role="listitem"
            >
              <span className="contacts-checklist-check" aria-hidden="true">
                ✓
              </span>
              <span className="contacts-checklist-label">{task.label}</span>

              {!task.done ? (
                <button
                  type="button"
                  className="contacts-checklist-how"
                  onClick={() => onShowHow(task.key)}
                >
                  {t("contactsOnboardingShowHow")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
