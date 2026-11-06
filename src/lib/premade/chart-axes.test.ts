import { describe, expect, it } from "vitest";

import { axisExtent, timeTicks, valueTicks } from "./chart-axes";

const id = (value: number) => String(value);

describe("timeTicks", () => {
  it("starts at zero and ends at the end of the match", () => {
    // 30 min num eixo de 600 px de largura útil: a primeira marca é 0, a última é o fim.
    const ticks = timeTicks(1_800, 640, 20, id);
    expect(ticks[0].at).toBe(20);
    expect(ticks[ticks.length - 1].at).toBe(620);
    expect(ticks[0].label).toBe("0");
  });

  it("uses round minute steps instead of arbitrary ones", () => {
    // 30 min com no máximo 4 marcas: o passo escolhido tem que dividir 30.
    const labels = timeTicks(1_800, 640, 20, id).map((tick) => Number(tick.label) / 60);
    const step = labels[1] - labels[0];
    expect([1, 2, 5, 10, 15, 30]).toContain(step);
    expect(30 % step).toBe(0);
  });

  it("keeps the tick count readable", () => {
    expect(timeTicks(3_600, 640, 20, id).length).toBeLessThanOrEqual(6);
    expect(timeTicks(600, 640, 20, id).length).toBeLessThanOrEqual(6);
  });

  it("says nothing without a duration", () => {
    expect(timeTicks(0, 640, 20, id)).toEqual([]);
    expect(timeTicks(Number.NaN, 640, 20, id)).toEqual([]);
    expect(timeTicks(-60, 640, 20, id)).toEqual([]);
  });

  it("says nothing when the drawing area has no width", () => {
    expect(timeTicks(1_800, 40, 20, id)).toEqual([]);
  });
});

describe("valueTicks", () => {
  it("is symmetric around zero", () => {
    // O eixo tem que mostrar a mesma vantagem para cima e para baixo.
    const ticks = valueTicks(6_000, 180, 10, id);
    const values = ticks.map((tick) => Number(tick.label));
    expect(values).toEqual([6_000, 3_000, 0, -3_000, -6_000]);
    // A marca do zero fica no meio da área útil.
    expect(ticks[2].at).toBe(10 + 160 / 2);
  });

  it("puts the positive end at the top of the viewBox", () => {
    const ticks = valueTicks(6_000, 180, 10, id);
    expect(ticks[0].at).toBe(10);
    expect(ticks[4].at).toBe(170);
  });

  it("says nothing without an extent", () => {
    expect(valueTicks(0, 180, 10, id)).toEqual([]);
    expect(valueTicks(Number.NaN, 180, 10, id)).toEqual([]);
  });
});

describe("axisExtent", () => {
  it("respects the floor for a nearly flat series", () => {
    // Uma curva de ±200 não pode ser ampliada até encher a tela: o piso manda.
    expect(axisExtent([100, -200, 150], 6_000)).toBe(6_000);
  });

  it("rounds up to a readable step", () => {
    expect(axisExtent([3_400, -1_000], 1_000)).toBe(5_000);
    expect(axisExtent([7_200], 1_000)).toBe(10_000);
    expect(axisExtent([1_100], 1_000)).toBe(2_000);
  });

  it("handles an empty series", () => {
    expect(axisExtent([], 6_000)).toBe(6_000);
  });
});
