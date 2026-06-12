# Documentation System

Use this reference when designing or migrating a downstream-user documentation system for a TypeScript library.

## Goal

Create a compact documentation set that:

- helps consumers quickly decide whether the library fits their needs
- helps consumers discover, evaluate, and use the published API
- keeps canonical facts near source
- favors executable examples over prose tutorials
- reduces hand-maintained duplicate reference material
- gives humans and AI agents a predictable retrieval path
- keeps contributor and maintainer material separate from consumer docs

## Recommended Layout

```text
README.md
CHANGELOG.md            # optional release notes, not API reference
docs/
  context.md            # optional for tiny packages; required when concepts are non-local
examples/
  *.ts                  # runnable usage patterns
src/
  **/*.ts               # public TSDoc lives here
dist/
  **/*.d.ts             # generated exact signature surface
  **/*.d.mts            # generated ESM declaration surface when applicable
```

## Ownership Model

| Surface | Owns | Does not own |
| --- | --- | --- |
| Public TSDoc | Symbol behavior, parameters, returns, errors, invariants, side effects, deprecations, related APIs | Broad conceptual essays, tutorials, internal notes |
| `examples/*.ts` | Executable usage, composition, common workflows, preferred defaults | Pseudocode, duplicate mini-guides, exhaustive API coverage |
| `docs/context.md` | Mental model, lifecycle, terminology, invariants, task-to-API selection, stable patterns and anti-patterns | API reference, contributor setup, release process |
| `README.md` | Fast human evaluation, fit/non-fit, hard requirements, primary tradeoff, install, one proof-oriented example, documentation map | Exhaustive reference, long guides, internal workflow |
| `dist/**/*.d.ts` / `*.d.mts` | Exact exported signatures and module shape | Manually authored behavior docs |
| `CHANGELOG.md` | Shipped consumer-visible change summaries | Canonical API semantics, unreleased planning notes by default |

Practical rule: if a statement can be derived from source, generated declarations, or an executable example, do not hand-maintain the same fact in prose.

## Public API Coverage

Treat the published surface as public:

- package export-map entrypoints
- source entry files intended for consumers
- symbols reachable from generated declaration files
- documented re-exports intended as API

Every public export should have at least a useful TSDoc summary. Add detailed tags when they clarify real behavior:

- `@param`
- `@returns`
- `@throws`
- `@example`
- `@remarks`
- `@deprecated`
- `@see`

Do not document internal helpers as public API unless they are intentionally exported. If declarations expose internal-only symbols, prefer fixing the package boundary over documenting the leak as official API.

## Section Schemas

Use schemas as defaults, not bureaucracy. Preserve a repo's established structure when it already expresses the same ownership model cleanly.

### README

```md
# <Library Name>

## What it does

## Is this for you?

Use this if:

- ...

Consider something else if:

- ...

## Requirements

## Quick Example

## Documentation
```

README guidance:

- Help a busy evaluator answer "should I keep reading?" within 30-60 seconds.
- Put hard requirements and disqualifying constraints before detailed API usage.
- State the main tradeoff: what the library optimizes for and what it does not try to do.
- Keep the quick example minimal, current, and proof-oriented; it should demonstrate the core value proposition, not merely syntax.
- Link to `docs/context.md`, examples, and generated declarations when present.
- Do not duplicate full option lists or per-symbol reference prose.
- Do not include contributor setup unless the repo has no other place and the user explicitly asks.

### docs/context.md

```md
# Overview

# When to Use

# When Not to Use

# Core Abstractions

# Lifecycle

# Common Tasks

# Recommended Patterns

# Patterns to Avoid

# Invariants and Constraints

# Error Model

# Terminology

# Non-Goals
```

Omit sections that do not apply. Keep this file short, stable, and library-specific. It should explain concepts that are hard to discover by reading one symbol's TSDoc.

## Examples

Add or update an example only when it covers a materially different consumer task or composition pattern.

Good examples are:

- runnable with existing project tooling
- small enough to inspect quickly
- named by task, not by API symbol
- based on real imports and valid option shapes
- clear about preferred defaults and edge-safe usage

Suggested names:

```text
examples/basic-usage.ts
examples/configuration.ts
examples/error-handling.ts
examples/framework-integration.ts
```

Avoid examples that are just API reference in code form, require heavy fixtures without payoff, or duplicate the README quick example.

## Change Rules

### Adding a public API

Update:

- source TSDoc
- declaration output or declaration emit config
- examples only if the API introduces a new usage pattern

Usually leave unchanged:

- `README.md`, unless the entry path or quick-start story changed
- `docs/context.md`, unless the conceptual model or API-selection guidance changed
- `CHANGELOG.md`, unless the repo maintains manual release notes

### Changing API behavior

Update:

- TSDoc for affected symbols
- affected examples
- declaration output when signatures change
- `docs/context.md` if lifecycle, invariants, terminology, or recommended patterns changed
- `CHANGELOG.md` only for consumer-visible release-note work

### Breaking changes

Update the same surfaces as behavior changes. Add migration material only when the change is externally disruptive enough that examples and TSDoc are not sufficient.

## Declaration Policy

Generated declarations are the exact signature lookup surface. They should be emitted from public entrypoints and treated as disposable build output.

For full documentation-system migrations:

- ensure declaration emit exists
- ensure declarations reflect public entrypoints
- avoid manual `reference.md` files that duplicate declarations

For narrow documentation edits:

- do not introduce build-system changes unless required by the user request
- report missing or stale declarations as a follow-up gap

## Changelog Policy

Use `CHANGELOG.md` only when the repo already maintains one, the user explicitly asks, or release-note work is part of the task.

Good entries:

- summarize shipped consumer-visible changes
- call out upgrade impact
- link to migration docs or releases when useful

Bad entries:

- canonical API semantics
- exhaustive per-symbol reference changes
- examples duplicated from docs
- planning notes unless the repo intentionally tracks unreleased work there

## Maintainer Material

Keep contributor onboarding, release checklists, internal architecture, test fixture notes, and local development playbooks out of consumer docs.

If the user asks for maintainer docs, put them in a separate surface such as:

- `CONTRIBUTING.md`
- `docs/maintainers.md`
- internal architecture docs

Do not repurpose README, examples, or `docs/context.md` for maintainer workflow.

## Retrieval Path

Optimize for this lookup order:

1. `README.md` for fast human evaluation, orientation, and routing
2. `docs/context.md` for concepts and API selection
3. generated declarations for exact signatures and module layout
4. source TSDoc for factual behavior
5. examples for executable usage patterns

This path works because each surface has one job and duplicate prose is aggressively removed.
