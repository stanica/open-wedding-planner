import { describe, it, expect } from "vitest";
import { isGogReadCommand } from "../../src/tools/gog.js";

describe("gog tool", () => {
  describe("isGogReadCommand", () => {
    it("classifies search as read", () => {
      expect(isGogReadCommand("gmail", ["search", "is:unread"])).toBe(true);
    });

    it("classifies list as read", () => {
      expect(isGogReadCommand("gmail", ["labels", "list"])).toBe(true);
    });

    it("classifies get as read", () => {
      expect(isGogReadCommand("gmail", ["threads", "get", "abc123"])).toBe(true);
    });

    it("classifies send as write", () => {
      expect(isGogReadCommand("gmail", ["send", "--to", "a@b.com"])).toBe(false);
    });

    it("classifies create as write", () => {
      expect(isGogReadCommand("cal", ["events", "create", "--title", "Meeting"])).toBe(false);
    });

    it("classifies delete as write", () => {
      expect(isGogReadCommand("gmail", ["threads", "delete", "abc"])).toBe(false);
    });

    it("classifies cal events list as read", () => {
      expect(isGogReadCommand("cal", ["events", "list"])).toBe(true);
    });

    it("classifies modify as write", () => {
      expect(isGogReadCommand("gmail", ["threads", "modify", "abc"])).toBe(false);
    });

    it("classifies trash as write", () => {
      expect(isGogReadCommand("gmail", ["threads", "trash", "abc"])).toBe(false);
    });
  });
});
