import { describe, expect, it } from "vitest";
import { UndoRedoHistory } from "./undo-redo";

describe("UndoRedoHistory", () => {
  it("undoes and redoes changes, clearing redo after a new edit", () => {
    const history = new UndoRedoHistory(0);
    history.push(1);
    history.push(2);
    expect(history.undo()).toBe(1);
    expect(history.redo()).toBe(2);
    history.undo();
    history.push(3);
    expect(history.canRedo).toBe(false);
    expect(history.value).toBe(3);
  });
});
