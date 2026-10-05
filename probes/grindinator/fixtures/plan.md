# Probe plan

Two trivial tasks for the Grindinator WP-01 probe. Each creates one file.

## Tasks

```json tiered-tasks
{
  "tasks": [
    {
      "id": "T01",
      "title": "Add hello.txt",
      "model": "sonnet",
      "effort": "low",
      "prompt": "Create the file hello.txt in the repository root. Its only line is: hello\nFiles to change: hello.txt\nVerify: read hello.txt and confirm its only line is hello."
    },
    {
      "id": "T02",
      "title": "Add world.txt",
      "model": "sonnet",
      "effort": "low",
      "prompt": "Create the file world.txt in the repository root. Its only line is: world\nFiles to change: world.txt\nVerify: read world.txt and confirm its only line is world."
    }
  ]
}
```
