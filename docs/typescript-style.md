## Typescript rules

Prettier handles formatting (quotes, semicolons, indentation, trailing commas); these rules cover what it can't.

### Readability and structure

- Prioritize readability. The rules below serve this one.
- Prefer early return. Avoid nesting deeper than two levels.
- Keep functions and components small:
  - Aim for about 30 lines per function, with one level of abstraction each.
  - Split a function when its name needs "and", or when you can describe its parts as separate steps.
  - In Vue, extract a composable or child component when a `<script setup>` mixes unrelated concerns, or a template grows past what fits on one screen.
  - Keep each function to a handful of parameters. Past three or four, pass an options object.
- Don't mutate function parameters.

### Types

- Never use `any`. Use `unknown` and narrow it, or use a Zod-inferred type.
- Don't use `@ts-ignore` or `@ts-nocheck`. If `@ts-expect-error` is unavoidable, add a comment explaining why.
- Avoid `as` casts and the non-null assertion `!`. If one is unavoidable, comment why it's safe. Derive types with `z.infer` and `InferResponseType` instead of casting.
- Use `interface` for object shapes. Use `type` for unions, intersections and aliases.
- Mark a field optional with `?` rather than `| undefined`.
- Never use the wrapper types `String`, `Number`, `Boolean` or `Object`, or `{}`. Use lowercase primitives.
- Use `readonly` for properties and arrays that shouldn't change.
- Use `T[]` for simple array types and `Array<T>` only for complex ones.
- Annotate exported function signatures. Don't annotate trivially inferred locals such as `const x: number = 5`.

### Modules

- Use named exports. No default exports, except where a tool requires them (`.vue` files, config files).
- Use `import type` for type-only imports.
- Don't use `namespace`. Use ES modules.

### Declarations and control flow

- Use `const` by default and `let` only when you reassign. Never use `var`.
- Use `===` and `!==`. `== null` is the only allowed loose comparison.
- Use `for...of` or array methods. Don't use `for...in` on arrays.
- Use string-literal unions or `as const` objects instead of `enum`. Never use `const enum`.

### Naming

- `UpperCamelCase` for types, interfaces, classes and components.
- `lowerCamelCase` for variables, functions and methods.
- `CONSTANT_CASE` for module-level constants (e.g. `USER_AGENT`).
- No `I` prefix on interfaces and no leading or trailing underscores.
- Name things for what they are, not their type. Avoid abbreviations.

### Errors and comments

- Only throw `Error` or its subclasses (`ApiError`, `ProviderError`). Never throw strings or plain objects.
- Never leave an empty `catch`. Handle the error, or comment why it is ignored.
- Comments explain why, not what. Don't repeat types in JSDoc.
- Use `/** */` JSDoc for exported APIs and `//` for implementation notes.
- Don't leave commented-out code behind.
