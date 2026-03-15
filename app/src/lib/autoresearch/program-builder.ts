// ---------------------------------------------------------------------------
// Program Builder — Builds and manages program.md files for research mandates
// ---------------------------------------------------------------------------
// A program.md is the instruction document that drives the edit-run-measure
// loop within an autoresearch family. It contains the objective, universe,
// scoring formula, constraints, accumulated learnings, and the current
// frontier snapshot. The ProgramBuilder creates, enriches, and parses these
// documents so that child workers receive focused, context-rich prompts.
// ---------------------------------------------------------------------------

import type {
  Hypothesis,
  ProgramConstraints,
  ProgramObjective,
  StrategyCandidate,
} from "./types";

// ---------------------------------------------------------------------------
// Scoring formula (matches yahoo_india_loop.py)
// ---------------------------------------------------------------------------

const SCORING_FORMULA =
  "total_return * 1000 + alpha * 200 + sharpe * 10 + sortino - max_drawdown * 1000";

// ---------------------------------------------------------------------------
// ProgramBuilder
// ---------------------------------------------------------------------------

export class ProgramBuilder {
  /**
   * Create the initial program.md for a new research family.
   *
   * The generated document follows a structured markdown format that the
   * autoresearch agent can parse and reason over. It includes:
   * - Objective statement
   * - Universe & benchmark
   * - Scoring formula
   * - Constraints (drawdown, Sharpe, positions, leverage, etc.)
   * - Instructions for the edit-run-measure loop
   */
  createBaseProgram(
    objective: string,
    universe: string[],
    benchmark: string,
    constraints: ProgramConstraints,
  ): string {
    const universeList = universe.map((t) => `  - ${t}`).join("\n");

    return `# Autoresearch Program

## Objective

${objective}

## Universe

${universeList}

## Benchmark

${benchmark}

## Scoring Formula

\`\`\`
composite_score = ${SCORING_FORMULA}
\`\`\`

Higher composite score is better. The formula rewards return and alpha heavily,
includes risk-adjusted metrics (Sharpe, Sortino), and penalises drawdown.

## Constraints

| Constraint | Value |
|---|---|
| Max Drawdown | ${(constraints.maxDrawdown * 100).toFixed(0)}% |
| Min Sharpe | ${constraints.minSharpe} |
| Max Positions | ${constraints.maxPositions} |
| Min Holding Days | ${constraints.minHoldingDays} |
| Max Annual Turnover | ${constraints.maxTurnover}x |
| Allow Short | ${constraints.allowShort ? "Yes" : "No"} |
| Allow Leverage | ${constraints.allowLeverage ? "Yes" : "No"} |
| Max Leverage | ${constraints.maxLeverage}x |
| Rebalance Frequency | ${constraints.rebalanceFrequency} |

## Instructions

You are an autonomous research agent. Your job is to discover strategies that
maximise the composite score within the constraints above.

### Loop

1. **Read** the current frontier and learnings below.
2. **Hypothesise** a mutation that could improve on the best strategy.
3. **Implement** the mutation as runnable strategy code.
4. **Evaluate** using the scoring formula.
5. **Record** the result. If the score improves, keep the variant; otherwise discard.
6. **Learn** from both successes and failures — update the learnings section.

### Rules

- Never violate the constraints. Strategies that breach constraints are auto-discarded.
- Prefer simple mutations that change one thing at a time.
- Track what you tried and why it failed — avoid repeating dead ends.
- When stuck, try a different mutation type (scorer swap, filter, regime gate).

## Learnings

_No learnings yet. This section will be enriched as the research progresses._

## Frontier

_No frontier candidates yet. Evaluate seed strategies to populate._
`;
  }

  /**
   * Enrich an existing program.md with new learnings and frontier data.
   *
   * This replaces the Learnings and Frontier sections with updated content
   * while preserving the rest of the document.
   */
  enrichProgram(
    existing: string,
    learnings: string[],
    frontier: StrategyCandidate[],
  ): string {
    let enriched = existing;

    // Replace the Learnings section
    enriched = replaceSection(
      enriched,
      "Learnings",
      formatLearnings(learnings),
    );

    // Replace the Frontier section
    enriched = replaceSection(
      enriched,
      "Frontier",
      formatFrontier(frontier),
    );

    return enriched;
  }

  /**
   * Create the specific prompt sent to a child worker to test a hypothesis.
   *
   * The prompt includes the full program context plus the specific mutation
   * instructions, so the child worker has all the context it needs to
   * implement and evaluate the hypothesis.
   */
  createMutationPrompt(program: string, hypothesis: Hypothesis): string {
    return `${program}

---

# Current Task: Test Hypothesis

## Hypothesis

**ID:** ${hypothesis.id}
**Type:** ${hypothesis.mutation}
**Priority:** ${hypothesis.priority}/100

### Description

${hypothesis.description}

### Rationale

${hypothesis.rationale}

### Expected Impact

- **Metric:** ${hypothesis.expectedImpact.metric}
- **Direction:** ${hypothesis.expectedImpact.direction}
- **Magnitude:** ${hypothesis.expectedImpact.magnitude}

## Instructions

1. Implement the mutation described above as a concrete strategy change.
2. Run the strategy against the universe and benchmark defined in the program.
3. Compute the composite score using the scoring formula.
4. Report the full metrics: total_return, alpha, sharpe, sortino, max_drawdown.
5. If the composite score improves on the current frontier best, report as KEEP.
6. If the composite score is worse, report as DISCARD with a brief explanation.

${hypothesis.parentStrategyId ? `**Parent Strategy ID:** ${hypothesis.parentStrategyId} — use this as your starting point.` : "**No parent strategy.** Start from the base template."}
`;
  }

  /**
   * Parse structured objective data from a program.md document.
   *
   * Extracts the key sections (goal, universe, benchmark, constraints,
   * scoring formula, target metrics) from the markdown structure.
   */
  extractObjective(program: string): ProgramObjective {
    const goal = extractSection(program, "Objective").trim();
    const universe = extractUniverse(program);
    const benchmark = extractBenchmark(program);
    const constraints = extractConstraints(program);

    return {
      goal,
      universe,
      benchmark,
      constraints,
      scoringFormula: SCORING_FORMULA,
      targetMetrics: {
        // Derive target metrics from constraints
        maxDrawdown: constraints.maxDrawdown,
        sharpe: constraints.minSharpe,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — section manipulation
// ---------------------------------------------------------------------------

/**
 * Extract the content of a markdown section (between ## Header and the next ##).
 */
function extractSection(markdown: string, heading: string): string {
  const pattern = new RegExp(
    `## ${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  const match = pattern.exec(markdown);
  return match ? match[1].trim() : "";
}

/**
 * Replace the content of a markdown section, preserving the heading.
 */
function replaceSection(
  markdown: string,
  heading: string,
  newContent: string,
): string {
  const pattern = new RegExp(
    `(## ${escapeRegex(heading)}\\s*\\n)[\\s\\S]*?(?=\\n## |$)`,
  );
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, `$1\n${newContent}\n`);
  }
  // Section doesn't exist — append it
  return `${markdown}\n## ${heading}\n\n${newContent}\n`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Internal helpers — formatting
// ---------------------------------------------------------------------------

function formatLearnings(learnings: string[]): string {
  if (learnings.length === 0) {
    return "_No learnings yet._";
  }
  return learnings
    .map((l, i) => `${i + 1}. ${l}`)
    .join("\n");
}

function formatFrontier(frontier: StrategyCandidate[]): string {
  if (frontier.length === 0) {
    return "_No frontier candidates yet._";
  }

  const sorted = [...frontier].sort((a, b) => b.score - a.score);

  const header = `| Rank | Name | Score | Return | Alpha | Sharpe | Max DD | Gen |
|------|------|-------|--------|-------|--------|--------|-----|`;

  const rows = sorted.map((c, i) => {
    const m = c.metrics;
    return `| ${i + 1} | ${c.name} | ${c.score.toFixed(1)} | ${(m.totalReturn * 100).toFixed(1)}% | ${(m.alpha * 100).toFixed(1)}% | ${m.sharpe.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% | ${c.generation} |`;
  });

  return `${header}\n${rows.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers — parsing
// ---------------------------------------------------------------------------

function extractUniverse(program: string): string[] {
  const section = extractSection(program, "Universe");
  // Parse bullet list: lines starting with "  - " or "- "
  return section
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function extractBenchmark(program: string): string {
  const section = extractSection(program, "Benchmark");
  return section.split("\n")[0]?.trim() ?? "";
}

function extractConstraints(program: string): ProgramConstraints {
  const section = extractSection(program, "Constraints");

  // Parse the markdown table
  const getValue = (label: string): string => {
    const pattern = new RegExp(`\\|\\s*${escapeRegex(label)}\\s*\\|\\s*([^|]+)\\|`);
    const match = pattern.exec(section);
    return match ? match[1].trim() : "";
  };

  const parsePercent = (s: string): number => {
    const num = parseFloat(s.replace("%", ""));
    return isNaN(num) ? 0 : num / 100;
  };

  const parseNumber = (s: string): number => {
    const num = parseFloat(s.replace("x", ""));
    return isNaN(num) ? 0 : num;
  };

  const parseBool = (s: string): boolean =>
    s.toLowerCase() === "yes" || s.toLowerCase() === "true";

  return {
    maxDrawdown: parsePercent(getValue("Max Drawdown")),
    minSharpe: parseNumber(getValue("Min Sharpe")),
    maxPositions: parseInt(getValue("Max Positions"), 10) || 15,
    minHoldingDays: parseInt(getValue("Min Holding Days"), 10) || 5,
    maxTurnover: parseNumber(getValue("Max Annual Turnover")),
    allowShort: parseBool(getValue("Allow Short")),
    allowLeverage: parseBool(getValue("Allow Leverage")),
    maxLeverage: parseNumber(getValue("Max Leverage")),
    rebalanceFrequency: getValue("Rebalance Frequency") as ProgramConstraints["rebalanceFrequency"] || "monthly",
  };
}
