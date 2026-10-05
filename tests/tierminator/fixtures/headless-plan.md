# Headless execute fixture

Three tiny tasks for the headless execute test.

## Tasks

```json tiered-tasks
{
  "tasks": [
    {
      "id": "T01",
      "title": "Add T01.txt",
      "model": "sonnet",
      "effort": "low",
      "prompt": "Create T01.txt in the repository root with the line T01.\nFiles to change: T01.txt\nVerify: read T01.txt and confirm its only line is T01."
    },
    {
      "id": "T02",
      "title": "Add T02.txt",
      "model": "sonnet",
      "effort": "low",
      "prompt": "Create T02.txt in the repository root with the line T02.\nFiles to change: T02.txt\nVerify: read T02.txt and confirm its only line is T02."
    },
    {
      "id": "T03",
      "title": "Add T03.txt",
      "model": "sonnet",
      "effort": "low",
      "prompt": "Create T03.txt in the repository root with the line T03.\nFiles to change: T03.txt\nVerify: read T03.txt and confirm its only line is T03."
    }
  ]
}
```
