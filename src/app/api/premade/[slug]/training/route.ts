import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireEdit } from "@/lib/premade/access";
import { evaluateTrainingGoals } from "@/lib/premade/analysis-payload";
import {
  getPlayers,
  getTeamBySlug,
  getTeamMatches,
  getTimelines,
} from "@/lib/premade/repository";
import { buildTeamAnalysis } from "@/lib/premade/team-analysis";
import { TRAINING_METRICS, type TrainingGoal } from "@/lib/premade/training";
import {
  archiveTrainingGoal,
  createTrainingGoal,
  getTrainingGoals,
  updateTrainingGoal,
} from "@/lib/premade/training-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ slug: string }>;
}

const metricSchema = z.enum(TRAINING_METRICS);

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  problem: z.string().trim().max(400).default(""),
  exercise: z.string().trim().max(400).default(""),
  metric: metricSchema,
  /** Pessoa do elenco, ou omitida para um objetivo do time. */
  person: z.string().min(1).nullish(),
  personName: z.string().trim().max(40).nullish(),
  /** Meta em número, quando a equipe definiu uma. Null = direção certa, sem número. */
  target: z.number().finite().nullish(),
  state: z.enum(["planned", "running"]).default("planned"),
  origin: z
    .object({ aspect: z.string().max(40), kind: z.enum(["problem", "strength"]) })
    .nullish(),
});

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  problem: z.string().trim().max(400).optional(),
  exercise: z.string().trim().max(400).optional(),
  target: z.number().finite().nullish(),
  state: z.enum(["planned", "running"]).optional(),
});

const bodySchema = z.union([
  z.object({ intent: z.literal("create"), goal: createSchema }),
  z.object({
    intent: z.literal("update"),
    id: z.string().uuid(),
    patch: patchSchema,
  }),
  z.object({ intent: z.literal("archive"), id: z.string().uuid() }),
  z.object({ intent: z.literal("evaluate"), id: z.string().uuid().optional() }),
]);

/**
 * Reavalia os objetivos abertos com as partidas que já estão no cache. Não chama a Riot: a coleta é
 * quem fala com o Riot; aqui só se compara o que ela gravou.
 */
async function reevaluate(teamId: string, only?: string) {
  const [matches, players, timelines, goals] = await Promise.all([
    getTeamMatches(teamId),
    getPlayers(teamId),
    getTimelines(teamId),
    getTrainingGoals(teamId),
  ]);
  const analysis = buildTeamAnalysis(matches, players, timelines);
  const open = goals.filter(
    (goal: TrainingGoal) => !goal.archived && (!only || goal.id === only),
  );
  return evaluateTrainingGoals(teamId, open, {
    matches,
    depths: analysis.depths,
    timelines,
    persist: true,
  });
}

/** GET /api/premade/[slug]/training — os objetivos com a leitura de hoje. Leitura aberta. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) return NextResponse.json({ error: "notFound" }, { status: 404 });
  try {
    return NextResponse.json({ goals: await reevaluate(team.id) });
  } catch (error) {
    console.error("[premade] training read failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * POST /api/premade/[slug]/training — criar, editar, arquivar ou reavaliar um objetivo.
 * Escrever exige a sessão de edição: a leitura é aberta, a mudança não.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalidInput", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    if (body.intent === "create") {
      const goal = await createTrainingGoal(team.id, {
        person: body.goal.person ?? null,
        personName: body.goal.personName ?? null,
        title: body.goal.title,
        problem: body.goal.problem,
        metric: body.goal.metric,
        baseline: null,
        target: body.goal.target ?? null,
        exercise: body.goal.exercise,
        state: body.goal.state,
        origin: body.goal.origin ?? null,
      });
      return NextResponse.json({ goal }, { status: 201 });
    }

    if (body.intent === "update") {
      const goal = await updateTrainingGoal(team.id, body.id, body.patch);
      return NextResponse.json({ goal });
    }

    if (body.intent === "archive") {
      await archiveTrainingGoal(team.id, body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ goals: await reevaluate(team.id, body.id) });
  } catch (error) {
    console.error("[premade] training write failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
