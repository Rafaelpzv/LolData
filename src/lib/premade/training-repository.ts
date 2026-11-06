// Supabase access for the training goals (§6). Server-only: every write uses the service-role client.
//
// The goal row holds what the team decided (title, exercise, metric, target, start). The evaluation
// history holds what the data said on each day: one row per day per goal, so a reading can be
// checked against the matches of that day even after new matches arrive.
import { supabaseAdmin } from "@/lib/supabase";

import type {
  GoalEvaluation,
  TrainingGoal,
  TrainingMetric,
  TrainingState,
  TrainingVerdict,
} from "./training";

/** The states a team may pick. The others are read from the data and never chosen. */
export type ChosenTrainingState = "planned" | "running";

interface GoalRow {
  id: string;
  team_id: string;
  person_id: string | null;
  person_name: string | null;
  title: string;
  problem: string;
  metric: string;
  baseline: number | null;
  target: number | null;
  starts_at: string;
  exercise: string;
  state: string;
  origin_aspect: string | null;
  origin_kind: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EvaluationRow {
  goal_id: string;
  evaluated_at: string;
  baseline_games: number;
  window_games: number;
  baseline_value: number | null;
  current_value: number | null;
  delta: number | null;
  relative: number | null;
  low: number | null;
  high: number | null;
  verdict: string;
  confidence: string;
  state: string;
  target_reached: boolean | null;
}

function toEvaluation(row: EvaluationRow): GoalEvaluation {
  return {
    at: Date.parse(row.evaluated_at),
    baselineGames: row.baseline_games,
    windowGames: row.window_games,
    baseline: row.baseline_value,
    current: row.current_value,
    delta: row.delta,
    relative: row.relative,
    low: row.low,
    high: row.high,
    verdict: row.verdict as TrainingVerdict,
    confidence: row.confidence as GoalEvaluation["confidence"],
    state: row.state as Exclude<TrainingState, "planned" | "running">,
    targetReached: row.target_reached,
  };
}

function toGoal(row: GoalRow, evaluations: GoalEvaluation[]): TrainingGoal {
  return {
    id: row.id,
    teamId: row.team_id,
    person: row.person_id,
    personName: row.person_name,
    title: row.title,
    problem: row.problem,
    metric: row.metric as TrainingMetric,
    baseline: row.baseline,
    target: row.target,
    startsAt: Date.parse(row.starts_at),
    exercise: row.exercise,
    state: row.state === "running" ? "running" : "planned",
    origin:
      row.origin_aspect && row.origin_kind
        ? {
            aspect: row.origin_aspect,
            kind: row.origin_kind === "strength" ? "strength" : "problem",
          }
        : null,
    // A linha recém-criada não tem `archived_at` no payload: sem a propriedade, ela não está arquivada.
    archived: row.archived_at != null,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    evaluations,
  };
}

/**
 * Every goal of the team, archived ones included (the panel filters), newest start first, each with
 * its evaluation history (most recent first).
 */
export async function getTrainingGoals(teamId: string): Promise<TrainingGoal[]> {
  const { data: goals, error } = await supabaseAdmin
    .from("premade_training_goals")
    .select(
      "id, team_id, person_id, person_name, title, problem, metric, baseline, target, starts_at, exercise, state, origin_aspect, origin_kind, archived_at, created_at, updated_at",
    )
    .eq("team_id", teamId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  const rows = (goals as GoalRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: evaluations, error: evalError } = await supabaseAdmin
    .from("premade_training_evaluations")
    .select(
      "goal_id, evaluated_at, baseline_games, window_games, baseline_value, current_value, delta, relative, low, high, verdict, confidence, state, target_reached",
    )
    .eq("team_id", teamId)
    .order("evaluated_at", { ascending: false });
  if (evalError) throw evalError;

  const byGoal = new Map<string, GoalEvaluation[]>();
  for (const row of (evaluations as EvaluationRow[] | null) ?? []) {
    const list = byGoal.get(row.goal_id) ?? [];
    list.push(toEvaluation(row));
    byGoal.set(row.goal_id, list);
  }
  return rows.map((row) => toGoal(row, byGoal.get(row.id) ?? []));
}

/** Reads the goals that are still open (not archived): what the panel shows first. */
export async function getActiveTrainingGoals(teamId: string): Promise<TrainingGoal[]> {
  const goals = await getTrainingGoals(teamId);
  return goals.filter((goal) => goal.archived === false);
}

export interface NewTrainingGoal {
  person: string | null;
  personName: string | null;
  title: string;
  problem: string;
  metric: TrainingMetric;
  baseline: number | null;
  target: number | null;
  startsAt?: number;
  exercise: string;
  state: ChosenTrainingState;
  origin: { aspect: string; kind: "problem" | "strength" } | null;
}

/** Creates a goal. The start defaults to now; nothing is evaluated until matches are played. */
export async function createTrainingGoal(
  teamId: string,
  goal: NewTrainingGoal,
): Promise<TrainingGoal> {
  const startsAt = new Date(goal.startsAt ?? Date.now()).toISOString();
  const { data, error } = await supabaseAdmin
    .from("premade_training_goals")
    .insert({
      team_id: teamId,
      person_id: goal.person,
      person_name: goal.personName,
      title: goal.title,
      problem: goal.problem,
      metric: goal.metric,
      baseline: goal.baseline,
      target: goal.target,
      starts_at: startsAt,
      exercise: goal.exercise,
      state: goal.state,
      origin_aspect: goal.origin?.aspect ?? null,
      origin_kind: goal.origin?.kind ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toGoal(data as GoalRow, []);
}

/** What the team may change by hand. The metric and the start are fixed once the goal exists. */
export interface TrainingGoalPatch {
  title?: string;
  problem?: string;
  exercise?: string;
  target?: number | null;
  state?: ChosenTrainingState;
}

export async function updateTrainingGoal(
  teamId: string,
  goalId: string,
  patch: TrainingGoalPatch,
): Promise<TrainingGoal> {
  const { data, error } = await supabaseAdmin
    .from("premade_training_goals")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.problem !== undefined ? { problem: patch.problem } : {}),
      ...(patch.exercise !== undefined ? { exercise: patch.exercise } : {}),
      ...(patch.target !== undefined ? { target: patch.target } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("team_id", teamId)
    .eq("id", goalId)
    .select("*")
    .single();
  if (error) throw error;
  return toGoal(data as GoalRow, []);
}

/** Archives (soft delete): the history of what was trained stays, the list stops showing it. */
export async function archiveTrainingGoal(
  teamId: string,
  goalId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("premade_training_goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("id", goalId);
  if (error) throw error;
}

/**
 * Saves one reading of a goal. One row per goal per UTC day: evaluating the panel twice a day
 * overwrites the day's reading instead of growing the history with duplicates.
 */
export async function saveGoalEvaluation(
  teamId: string,
  goalId: string,
  evaluation: GoalEvaluation,
): Promise<void> {
  const at = new Date(evaluation.at);
  // O dia UTC é a chave: a mesma leitura do mesmo dia é sobrescrita, não duplicada.
  const day = at.toISOString().slice(0, 10);
  const { error } = await supabaseAdmin
    .from("premade_training_evaluations")
    .upsert(
      {
        goal_id: goalId,
        team_id: teamId,
        evaluated_at: at.toISOString(),
        evaluated_day: day,
        baseline_games: evaluation.baselineGames,
        window_games: evaluation.windowGames,
        baseline_value: evaluation.baseline,
        current_value: evaluation.current,
        delta: evaluation.delta,
        relative: evaluation.relative,
        low: evaluation.low,
        high: evaluation.high,
        verdict: evaluation.verdict,
        confidence: evaluation.confidence,
        state: evaluation.state,
        target_reached: evaluation.targetReached,
      },
      { onConflict: "goal_id,evaluated_day" },
    );
  if (error) throw error;
}
