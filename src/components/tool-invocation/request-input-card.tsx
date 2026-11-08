"use client";

import React, { useState } from "react";
import { Button } from "ui/button";
import { Input } from "ui/input";

export type RequestInputOption =
  | string
  | { label: string; description?: string };

export type RequestInputQuestion = {
  header: string;
  question: string;
  options?: RequestInputOption[];
  multiSelect?: boolean;
  placeholder?: string;
  inputType?: "text" | "number" | "email" | "url";
};

export type RequestInputAnswer = {
  header: string;
  question: string;
  value: string;
};

function optionLabel(option: RequestInputOption) {
  return typeof option === "string" ? option : option.label;
}

export function RequestInputCard({
  questions,
  submitted,
  disabled,
  onSubmit,
}: {
  questions: RequestInputQuestion[];
  submitted: Record<string, unknown> | null;
  disabled: boolean;
  onSubmit: (answers: RequestInputAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [picked, setPicked] = useState<string[][]>(questions.map(() => []));
  const submittedAnswers = submitted?.answers as
    | RequestInputAnswer[]
    | undefined;
  const settled = Boolean(submittedAnswers);
  const canSubmit = answers.every((answer) => answer.trim().length > 0);
  const options = questions.map((question) => question.options ?? []);

  const toggleOption = (
    index: number,
    question: RequestInputQuestion,
    label: string,
  ) => {
    const selected = picked[index] ?? [];
    const next = question.multiSelect
      ? selected.includes(label)
        ? selected.filter((value) => value !== label)
        : [...selected, label]
      : selected.includes(label)
        ? []
        : [label];
    setPicked((current) =>
      current.map((value, answerIndex) =>
        answerIndex === index ? next : value,
      ),
    );
    setAnswers((current) =>
      current.map((value, answerIndex) =>
        answerIndex === index ? next.join(", ") : value,
      ),
    );
  };

  const setFreeText = (index: number, value: string) => {
    setAnswers((current) =>
      current.map((answer, answerIndex) =>
        answerIndex === index ? value : answer,
      ),
    );
    setPicked((current) =>
      current.map((selected, answerIndex) =>
        answerIndex === index ? [] : selected,
      ),
    );
  };

  if (!questions.length) return null;

  return (
    <section className="my-3 overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="border-b px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
        {settled ? "Answers submitted" : "A few details"}
      </header>
      <div className="space-y-4 px-4 py-3">
        {questions.map((question, index) => (
          <div className="space-y-2" key={`${question.header}-${index}`}>
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {question.header}
            </div>
            <p className="text-sm">{question.question}</p>
            {settled ? (
              <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">
                {submittedAnswers?.[index]?.value}
              </p>
            ) : (
              <>
                {options[index].length ? (
                  <div className="flex flex-wrap gap-2">
                    {options[index].map((option) => {
                      const label = optionLabel(option);
                      const description =
                        typeof option === "string"
                          ? undefined
                          : option.description;
                      return (
                        <Button
                          aria-pressed={picked[index]?.includes(label) ?? false}
                          disabled={disabled}
                          key={label}
                          onClick={() => toggleOption(index, question, label)}
                          size="sm"
                          variant={
                            picked[index]?.includes(label)
                              ? "secondary"
                              : "outline"
                          }
                        >
                          <span>
                            {label}
                            {description && (
                              <span className="block text-[11px] font-normal opacity-80">
                                {description}
                              </span>
                            )}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
                <Input
                  aria-label={question.question}
                  disabled={disabled}
                  maxLength={2000}
                  onChange={(event) => setFreeText(index, event.target.value)}
                  placeholder={
                    question.placeholder ??
                    (options[index].length
                      ? "Choose an option or enter another answer"
                      : "Enter your answer")
                  }
                  type={question.inputType ?? "text"}
                  value={answers[index]}
                />
              </>
            )}
          </div>
        ))}
        {!settled && (
          <div className="flex justify-end">
            <Button
              disabled={disabled || !canSubmit}
              onClick={() =>
                onSubmit(
                  questions.map((question, index) => ({
                    header: question.header,
                    question: question.question,
                    value: answers[index].trim(),
                  })),
                )
              }
            >
              Send answers
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
