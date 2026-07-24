```markdown
# Vitalis Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns used in the Vitalis codebase, a TypeScript project built with the Next.js framework. You'll learn the project's coding conventions, file organization, import/export styles, and testing patterns. This guide also provides suggested commands for common workflows to streamline your development process.

## Coding Conventions

### File Naming
- **Convention:** camelCase for file names.
- **Example:**
  ```
  userProfile.ts
  fetchData.test.ts
  ```

### Import Style
- **Convention:** Use alias imports for modules.
- **Example:**
  ```typescript
  import { fetchUser } from '@/services/userService';
  ```

### Export Style
- **Convention:** Named exports are preferred.
- **Example:**
  ```typescript
  // userService.ts
  export function fetchUser(id: string) { ... }
  ```

### Commit Patterns
- **Type:** Freeform (no strict prefixes or types required)
- **Example:**
  ```
  Add user authentication logic
  Fix bug in profile update handler
  ```

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new feature or module  
**Command:** `/add-feature`

1. Create a new file using camelCase naming (e.g., `newFeature.ts`).
2. Use alias imports to bring in dependencies.
3. Export your functions or components with named exports.
4. Write corresponding test files as `newFeature.test.ts`.
5. Commit your changes with a clear, descriptive message.

### Refactoring Existing Code
**Trigger:** When improving or reorganizing existing code  
**Command:** `/refactor`

1. Identify the target file(s) for refactoring.
2. Maintain camelCase file naming if renaming files.
3. Update imports to use aliases if needed.
4. Ensure all exports remain named.
5. Update or add tests as necessary.
6. Commit with a descriptive message about the refactor.

### Writing Tests
**Trigger:** When adding or updating tests  
**Command:** `/write-test`

1. Create a test file named `moduleName.test.ts` alongside the module.
2. Implement tests using the project's preferred testing framework (framework unknown; follow existing patterns).
3. Use alias imports for any dependencies.
4. Commit with a message describing the test coverage.

## Testing Patterns

- **Test File Pattern:** All test files follow the `*.test.*` naming convention (e.g., `userService.test.ts`).
- **Framework:** The specific testing framework is not specified; follow the structure of existing tests.
- **Example:**
  ```typescript
  // userService.test.ts
  import { fetchUser } from '@/services/userService';

  describe('fetchUser', () => {
    it('returns user data for a valid ID', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command        | Purpose                                 |
|----------------|-----------------------------------------|
| /add-feature   | Scaffold and implement a new feature    |
| /refactor      | Refactor existing code                  |
| /write-test    | Add or update tests for a module        |
```
