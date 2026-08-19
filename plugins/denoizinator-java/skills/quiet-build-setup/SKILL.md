---
name: quiet-build-setup
description: Install the quiet build and test harness into a Maven or Gradle repository. Use when a repo produces verbose Maven or Gradle output, when the user asks to reduce build noise or token usage in a Java project, or when setting up Denoizinator in a new repo.
---

# Quiet build setup (Java)

Install the repository-side layer that keeps Maven and Gradle output out of context.

## Steps

1. Detect the build system: `pom.xml` means Maven, `build.gradle` or
   `build.gradle.kts` means Gradle. A repo may have both.
2. Copy the matching template from `${CLAUDE_PLUGIN_ROOT}/assets/`.
3. Add `.dnz/` to `.gitignore`.
4. Verify the build emits errors and a summary only.

## Notes

- Maven: `-B --no-transfer-progress` removes the dependency-download churn that
  dominates a cold build. `-q` suppresses too much on its own; test failures
  disappear with it.
- Gradle: `--console=plain` removes the progress bar redraw. The daemon's first
  run is noisy regardless.
- Report one or two words on success.
