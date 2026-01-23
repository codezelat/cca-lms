"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";

interface Question {
  id?: string;
  text: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "LONG_ANSWER";
  points: number;
  order: number;
  answers: Answer[];
}

interface Answer {
  id?: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface Quiz {
  id?: string;
  lessonId: string;
  title: string;
  description: string;
  timeLimit: number | null;
  passingScore: number;
  maxAttempts: number | null;
  shuffleQuestions: boolean;
  showResults: boolean;
  questions: Question[];
}

interface QuizBuilderProps {
  lessonId: string;
  existingQuizId?: string;
  onSuccess?: (quiz: Quiz) => void;
  onCancel?: () => void;
}

export function QuizBuilder({
  lessonId,
  existingQuizId,
  onSuccess,
  onCancel,
}: QuizBuilderProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState<Quiz>({
    lessonId,
    title: "",
    description: "",
    timeLimit: null,
    passingScore: 70,
    maxAttempts: null,
    shuffleQuestions: false,
    showResults: true,
    questions: [],
  });

  useEffect(() => {
    if (existingQuizId) {
      fetchQuiz();
    }
  }, [existingQuizId]);

  const fetchQuiz = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/quizzes/${existingQuizId}?includeQuestions=true`,
      );
      if (!response.ok) throw new Error("Failed to fetch quiz");
      const data = await response.json();
      setQuiz(data.quiz);
    } catch (error) {
      toast.error("Failed to load quiz");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      text: "",
      type: "MULTIPLE_CHOICE",
      points: 1,
      order: quiz.questions.length,
      answers: [
        { text: "", isCorrect: true, order: 0 },
        { text: "", isCorrect: false, order: 1 },
      ],
    };
    setQuiz({ ...quiz, questions: [...quiz.questions, newQuestion] });
  };

  const removeQuestion = (index: number) => {
    const updated = quiz.questions.filter((_, i) => i !== index);
    setQuiz({ ...quiz, questions: updated });
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const updated = [...quiz.questions];
    updated[index] = { ...updated[index], ...updates };

    // Auto-adjust answers based on question type
    if (updates.type === "TRUE_FALSE") {
      updated[index].answers = [
        { text: "True", isCorrect: true, order: 0 },
        { text: "False", isCorrect: false, order: 1 },
      ];
    } else if (
      updates.type === "SHORT_ANSWER" ||
      updates.type === "LONG_ANSWER"
    ) {
      updated[index].answers = [];
    }

    setQuiz({ ...quiz, questions: updated });
  };

  const addAnswer = (questionIndex: number) => {
    const updated = [...quiz.questions];
    const question = updated[questionIndex];
    question.answers.push({
      text: "",
      isCorrect: false,
      order: question.answers.length,
    });
    setQuiz({ ...quiz, questions: updated });
  };

  const removeAnswer = (questionIndex: number, answerIndex: number) => {
    const updated = [...quiz.questions];
    updated[questionIndex].answers = updated[questionIndex].answers.filter(
      (_, i) => i !== answerIndex,
    );
    setQuiz({ ...quiz, questions: updated });
  };

  const updateAnswer = (
    questionIndex: number,
    answerIndex: number,
    updates: Partial<Answer>,
  ) => {
    const updated = [...quiz.questions];
    const answers = updated[questionIndex].answers;

    // For multiple choice, ensure only one correct answer
    if (
      updates.isCorrect &&
      updated[questionIndex].type === "MULTIPLE_CHOICE"
    ) {
      answers.forEach((a, i) => {
        a.isCorrect = i === answerIndex;
      });
    } else {
      answers[answerIndex] = { ...answers[answerIndex], ...updates };
    }

    setQuiz({ ...quiz, questions: updated });
  };

  const handleSave = async () => {
    // Validation
    if (!quiz.title.trim()) {
      toast.error("Quiz title is required");
      return;
    }

    if (quiz.questions.length === 0) {
      toast.error("Add at least one question");
      return;
    }

    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      if (!q.text.trim()) {
        toast.error(`Question ${i + 1} text is required`);
        return;
      }

      if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
        if (q.answers.length < 2) {
          toast.error(`Question ${i + 1} needs at least 2 answers`);
          return;
        }
        if (!q.answers.some((a) => a.isCorrect)) {
          toast.error(`Question ${i + 1} must have a correct answer`);
          return;
        }
        if (q.answers.some((a) => !a.text.trim())) {
          toast.error(`Question ${i + 1} has empty answers`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const url = existingQuizId
        ? `/api/admin/quizzes/${existingQuizId}`
        : "/api/admin/quizzes";
      const method = existingQuizId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quiz),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save quiz");
      }

      const data = await response.json();
      toast.success(
        existingQuizId
          ? "Quiz updated successfully"
          : "Quiz created successfully",
      );
      onSuccess?.(data.quiz);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save quiz",
      );
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quiz Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-terminal-green" />
            Quiz Settings
          </CardTitle>
          <CardDescription>
            Configure quiz metadata and behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="title">Quiz Title *</Label>
              <Input
                id="title"
                value={quiz.title}
                onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
                placeholder="e.g., Module 1 Assessment"
              />
            </div>
            <div>
              <Label htmlFor="passingScore">Passing Score (%)</Label>
              <Input
                id="passingScore"
                type="number"
                min="0"
                max="100"
                value={quiz.passingScore}
                onChange={(e) =>
                  setQuiz({ ...quiz, passingScore: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={quiz.description}
              onChange={(e) =>
                setQuiz({ ...quiz, description: e.target.value })
              }
              placeholder="Brief description of the quiz"
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
              <Input
                id="timeLimit"
                type="number"
                min="0"
                value={quiz.timeLimit || ""}
                onChange={(e) =>
                  setQuiz({
                    ...quiz,
                    timeLimit: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="No limit"
              />
            </div>
            <div>
              <Label htmlFor="maxAttempts">Max Attempts</Label>
              <Input
                id="maxAttempts"
                type="number"
                min="1"
                value={quiz.maxAttempts || ""}
                onChange={(e) =>
                  setQuiz({
                    ...quiz,
                    maxAttempts: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="shuffle"
                checked={quiz.shuffleQuestions}
                onCheckedChange={(checked) =>
                  setQuiz({ ...quiz, shuffleQuestions: checked })
                }
              />
              <Label htmlFor="shuffle" className="cursor-pointer">
                Shuffle Questions
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="showResults"
                checked={quiz.showResults}
                onCheckedChange={(checked) =>
                  setQuiz({ ...quiz, showResults: checked })
                }
              />
              <Label htmlFor="showResults" className="cursor-pointer">
                Show Results After Submission
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Questions ({quiz.questions.length})</CardTitle>
              <CardDescription>
                Add and configure quiz questions
              </CardDescription>
            </div>
            <Button onClick={addQuestion} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {quiz.questions.length === 0 ? (
            <div className="text-center py-8 text-terminal-text-muted">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No questions yet. Click &quot;Add Question&quot; to start.</p>
            </div>
          ) : (
            quiz.questions.map((question, qIndex) => (
              <Card key={qIndex} className="border-terminal-green/20">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <GripVertical className="h-5 w-5 text-terminal-text-muted mt-1" />
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-terminal-green">
                            Q{qIndex + 1}
                          </span>
                          <Select
                            value={question.type}
                            onValueChange={(value) =>
                              updateQuestion(qIndex, {
                                type: value as Question["type"],
                              })
                            }
                          >
                            <SelectTrigger className="w-[180px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MULTIPLE_CHOICE">
                                Multiple Choice
                              </SelectItem>
                              <SelectItem value="TRUE_FALSE">
                                True/False
                              </SelectItem>
                              <SelectItem value="SHORT_ANSWER">
                                Short Answer
                              </SelectItem>
                              <SelectItem value="LONG_ANSWER">
                                Long Answer
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={question.points}
                            onChange={(e) =>
                              updateQuestion(qIndex, {
                                points: Number(e.target.value),
                              })
                            }
                            className="w-20 h-8"
                            placeholder="Points"
                          />
                          <span className="text-xs text-terminal-text-muted">
                            pts
                          </span>
                        </div>

                        <Textarea
                          value={question.text}
                          onChange={(e) =>
                            updateQuestion(qIndex, { text: e.target.value })
                          }
                          placeholder="Enter question text..."
                          rows={2}
                        />

                        {/* Answers */}
                        {(question.type === "MULTIPLE_CHOICE" ||
                          question.type === "TRUE_FALSE") && (
                          <div className="space-y-2 mt-3">
                            <Label className="text-xs text-terminal-text-muted">
                              Answers{" "}
                              {question.type === "MULTIPLE_CHOICE" &&
                                "(select correct answer)"}
                            </Label>
                            {question.answers.map((answer, aIndex) => (
                              <div
                                key={aIndex}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type={
                                    question.type === "MULTIPLE_CHOICE"
                                      ? "radio"
                                      : "checkbox"
                                  }
                                  checked={answer.isCorrect}
                                  onChange={(e) =>
                                    updateAnswer(qIndex, aIndex, {
                                      isCorrect: e.target.checked,
                                    })
                                  }
                                  disabled={question.type === "TRUE_FALSE"}
                                  className="h-4 w-4 text-terminal-green"
                                />
                                <Input
                                  value={answer.text}
                                  onChange={(e) =>
                                    updateAnswer(qIndex, aIndex, {
                                      text: e.target.value,
                                    })
                                  }
                                  placeholder={`Answer ${aIndex + 1}`}
                                  disabled={question.type === "TRUE_FALSE"}
                                  className="flex-1"
                                />
                                {question.type === "MULTIPLE_CHOICE" &&
                                  question.answers.length > 2 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeAnswer(qIndex, aIndex)
                                      }
                                      className="h-8 w-8 p-0"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                              </div>
                            ))}
                            {question.type === "MULTIPLE_CHOICE" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addAnswer(qIndex)}
                                className="w-full"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add Answer
                              </Button>
                            )}
                          </div>
                        )}

                        {(question.type === "SHORT_ANSWER" ||
                          question.type === "LONG_ANSWER") && (
                          <div className="p-2 bg-terminal-darker/50 rounded border border-terminal-green/20">
                            <p className="text-xs text-terminal-text-muted">
                              This question requires manual grading. Students
                              will enter text.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(qIndex)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {existingQuizId ? "Update Quiz" : "Create Quiz"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
