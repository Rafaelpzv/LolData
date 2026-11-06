import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes da rota de treinamento (§10, "testes das rotas afetadas").
 *
 * A rota é o único lugar onde a leitura aberta e a escrita protegida convivem, então é onde o erro
 * de segurança aconteceria. Cada dependência externa é substituída: o teste não fala com o Supabase.
 */

const requireEdit = vi.fn();
const getTeamBySlug = vi.fn();
const createTrainingGoal = vi.fn();
const updateTrainingGoal = vi.fn();
const archiveTrainingGoal = vi.fn();
const getTrainingGoals = vi.fn();
const evaluateTrainingGoals = vi.fn();

vi.mock("@/lib/premade/access", () => ({ requireEdit: (...args: unknown[]) => requireEdit(...args) }));
vi.mock("@/lib/premade/repository", () => ({
  getTeamBySlug: (...args: unknown[]) => getTeamBySlug(...args),
  getPlayers: async () => [],
  getTeamMatches: async () => [],
  getTimelines: async () => [],
}));
vi.mock("@/lib/premade/team-analysis", () => ({
  buildTeamAnalysis: () => ({ depths: [], metrics: { games: 0 } }),
}));
vi.mock("@/lib/premade/analysis-payload", () => ({
  evaluateTrainingGoals: (...args: unknown[]) => evaluateTrainingGoals(...args),
}));
vi.mock("@/lib/premade/training-repository", () => ({
  createTrainingGoal: (...args: unknown[]) => createTrainingGoal(...args),
  updateTrainingGoal: (...args: unknown[]) => updateTrainingGoal(...args),
  archiveTrainingGoal: (...args: unknown[]) => archiveTrainingGoal(...args),
  getTrainingGoals: (...args: unknown[]) => getTrainingGoals(...args),
}));

const { GET, POST } = await import("@/app/api/premade/[slug]/training/route");

const TEAM = { id: "team-1", slug: "premade-flex", name: "Premade Flex" };
const params = Promise.resolve({ slug: "premade-flex" });

/** Um NextRequest com corpo JSON, do jeito que a rota recebe. */
function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/premade/premade-flex/training", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A resposta de bloqueio que `requireEdit` devolve, no formato do Next. */
function locked() {
  return {
    team: TEAM,
    denied: Response.json({ error: "locked" }, { status: 401 }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTeamBySlug.mockResolvedValue(TEAM);
  requireEdit.mockResolvedValue({ team: TEAM, denied: null });
  getTrainingGoals.mockResolvedValue([]);
  evaluateTrainingGoals.mockResolvedValue([]);
  createTrainingGoal.mockResolvedValue({ id: "goal-1" });
  updateTrainingGoal.mockResolvedValue({ id: "goal-1" });
  archiveTrainingGoal.mockResolvedValue(undefined);
});

describe("GET /api/premade/[slug]/training", () => {
  it("reads the goals without asking for the edit session", async () => {
    // A leitura é aberta: quem vê a página vê o treinamento.
    const response = await GET(request({}), { params });
    expect(response.status).toBe(200);
    expect(requireEdit).not.toHaveBeenCalled();
    expect(getTrainingGoals).toHaveBeenCalledWith("team-1");
  });

  it("answers 404 for a slug that does not exist", async () => {
    getTeamBySlug.mockResolvedValue(null);
    const response = await GET(request({}), { params });
    expect(response.status).toBe(404);
  });

  it("answers 500 when the database fails, instead of crashing", async () => {
    getTrainingGoals.mockRejectedValue(new Error("boom"));
    const response = await GET(request({}), { params });
    expect(response.status).toBe(500);
  });

  it("leaves archived goals out of the list", async () => {
    getTrainingGoals.mockResolvedValue([
      { id: "a", archived: false },
      { id: "b", archived: true },
    ]);
    await GET(request({}), { params });
    const [, goals] = evaluateTrainingGoals.mock.calls[0];
    expect(goals.map((goal: { id: string }) => goal.id)).toEqual(["a"]);
  });
});

describe("POST /api/premade/[slug]/training — a barreira de escrita", () => {
  it("refuses to create without the edit session", async () => {
    requireEdit.mockResolvedValue(locked());
    const response = await POST(
      request({ intent: "create", goal: { title: "Farm", metric: "csDiffAt10" } }),
      { params },
    );
    expect(response.status).toBe(401);
    // Nada foi escrito: a barreira vem antes de tocar no banco.
    expect(createTrainingGoal).not.toHaveBeenCalled();
  });

  it("refuses to archive without the edit session", async () => {
    requireEdit.mockResolvedValue(locked());
    const response = await POST(
      request({ intent: "archive", id: "00000000-0000-4000-8000-000000000000" }),
      { params },
    );
    expect(response.status).toBe(401);
    expect(archiveTrainingGoal).not.toHaveBeenCalled();
  });

  it("refuses to evaluate without the edit session", async () => {
    requireEdit.mockResolvedValue(locked());
    const response = await POST(request({ intent: "evaluate" }), { params });
    expect(response.status).toBe(401);
    expect(evaluateTrainingGoals).not.toHaveBeenCalled();
  });
});

describe("POST /api/premade/[slug]/training — a validação", () => {
  it("rejects a body that is not an object", async () => {
    const response = await POST(request(null), { params });
    expect(response.status).toBe(400);
    expect(createTrainingGoal).not.toHaveBeenCalled();
  });

  it("rejects an unknown intent", async () => {
    const response = await POST(request({ intent: "deleteEverything" }), { params });
    expect(response.status).toBe(400);
  });

  it("rejects a title that is too short", async () => {
    const response = await POST(
      request({ intent: "create", goal: { title: "ab", metric: "csDiffAt10" } }),
      { params },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a metric outside the training vocabulary", async () => {
    // O banco também recusa (constraint), mas a rota falha antes e devolve 400, não 500.
    const response = await POST(
      request({
        intent: "create",
        goal: { title: "Farm na rota", metric: "winRate" },
      }),
      { params },
    );
    expect(response.status).toBe(400);
    expect(createTrainingGoal).not.toHaveBeenCalled();
  });

  it("rejects a target that is not a finite number", async () => {
    const response = await POST(
      request({
        intent: "create",
        goal: { title: "Farm na rota", metric: "csDiffAt10", target: "muito" },
      }),
      { params },
    );
    expect(response.status).toBe(400);
  });

  it("rejects an id that is not a uuid", async () => {
    const response = await POST(request({ intent: "archive", id: "não-é-uuid" }), {
      params,
    });
    expect(response.status).toBe(400);
    expect(archiveTrainingGoal).not.toHaveBeenCalled();
  });

  it("rejects an origin kind that the analysis never produces", async () => {
    const response = await POST(
      request({
        intent: "create",
        goal: {
          title: "Farm na rota",
          metric: "csDiffAt10",
          origin: { aspect: "farming", kind: "neutral" },
        },
      }),
      { params },
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/premade/[slug]/training — os caminhos válidos", () => {
  it("creates a goal and answers 201", async () => {
    const response = await POST(
      request({
        intent: "create",
        goal: {
          title: "Farm na rota",
          metric: "csDiffAt10",
          exercise: "10 min de farm",
          person: "p1",
          personName: "Ana",
          target: 20,
          state: "planned",
          origin: { aspect: "farming", kind: "problem" },
        },
      }),
      { params },
    );
    expect(response.status).toBe(201);
    expect(createTrainingGoal).toHaveBeenCalledWith(
      "team-1",
      expect.objectContaining({
        person: "p1",
        personName: "Ana",
        metric: "csDiffAt10",
        target: 20,
        state: "planned",
      }),
    );
  });

  it("creates a team goal when no person is given", async () => {
    await POST(
      request({ intent: "create", goal: { title: "Mortes do grupo", metric: "teamDeathsPerGame" } }),
      { params },
    );
    expect(createTrainingGoal).toHaveBeenCalledWith(
      "team-1",
      expect.objectContaining({ person: null, target: null }),
    );
  });

  it("updates only the fields the team sent", async () => {
    await POST(
      request({
        intent: "update",
        id: "00000000-0000-4000-8000-000000000000",
        patch: { exercise: "novo exercício" },
      }),
      { params },
    );
    expect(updateTrainingGoal).toHaveBeenCalledWith(
      "team-1",
      "00000000-0000-4000-8000-000000000000",
      { exercise: "novo exercício" },
    );
  });

  it("archives a goal without deleting its history", async () => {
    const response = await POST(
      request({ intent: "archive", id: "00000000-0000-4000-8000-000000000000" }),
      { params },
    );
    expect(response.status).toBe(200);
    // Arquivar é marcar, nunca apagar: a rota não tem caminho de DELETE.
    expect(archiveTrainingGoal).toHaveBeenCalledWith(
      "team-1",
      "00000000-0000-4000-8000-000000000000",
    );
  });

  it("calls no cause a consistent improvement when the data did not say so", async () => {
    // A avaliação é a que o motor devolve: a rota não decide veredito por conta própria.
    evaluateTrainingGoals.mockResolvedValue([
      { goal: { id: "a" }, evaluation: { verdict: "notEnoughGames" } },
    ]);
    const response = await POST(request({ intent: "evaluate" }), { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      goals: { evaluation: { verdict: string } }[];
    };
    expect(body.goals[0].evaluation.verdict).toBe("notEnoughGames");
  });
});
