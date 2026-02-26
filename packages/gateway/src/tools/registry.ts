import type { Tool } from "ai";

export interface ToolRegistration {
  name: string;
  description: string;
  category: string;
  tool: Tool;
}

export interface ToolFactoryRegistration {
  description: string;
  category: string;
  create: (ctx: unknown) => Tool;
}

interface RegistryEntry {
  name: string;
  description: string;
  category: string;
  tool?: Tool;
  factory?: (ctx: unknown) => Tool;
}

export class ToolRegistry {
  private entries = new Map<string, RegistryEntry>();

  register(reg: ToolRegistration): void {
    this.entries.set(reg.name, {
      name: reg.name,
      description: reg.description,
      category: reg.category,
      tool: reg.tool,
    });
  }

  registerFactory(name: string, reg: ToolFactoryRegistration): void {
    this.entries.set(name, {
      name,
      description: reg.description,
      category: reg.category,
      factory: reg.create,
    });
  }

  get(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  getByCategory(category: string): RegistryEntry[] {
    return [...this.entries.values()].filter((e) => e.category === category);
  }

  getToolSet(names: string[]): Record<string, Tool> {
    const set: Record<string, Tool> = {};
    for (const name of names) {
      const entry = this.entries.get(name);
      if (!entry) throw new Error(`Unknown tool: ${name}`);
      if (!entry.tool) throw new Error(`Tool ${name} is a factory — use getToolSetWithContext`);
      set[name] = entry.tool;
    }
    return set;
  }

  getToolSetWithContext(names: string[], ctx: unknown): Record<string, Tool> {
    const set: Record<string, Tool> = {};
    for (const name of names) {
      const entry = this.entries.get(name);
      if (!entry) throw new Error(`Unknown tool: ${name}`);
      if (entry.factory) {
        set[name] = entry.factory(ctx);
      } else if (entry.tool) {
        set[name] = entry.tool;
      }
    }
    return set;
  }

  listAll(): Array<{ name: string; description: string; category: string }> {
    return [...this.entries.values()].map(({ name, description, category }) => ({
      name,
      description,
      category,
    }));
  }
}
